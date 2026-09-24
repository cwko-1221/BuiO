'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..', '..');
const routerPath = path.join(projectRoot, 'pet-app', 'routes', 'pet.js');

function routesForEnvironment(nodeEnv) {
  const inspectRouter = `
    const router = require(${JSON.stringify(routerPath)});
    const routes = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
        handlers: layer.route.stack.map((routeLayer) => routeLayer.name),
      }));
    const bootstrap = router.stack.find((layer) => layer.route?.path === '/bootstrap').route;
    const requireStudent = bootstrap.stack.find((layer) => layer.name === 'requireStudent').handle;
    function probe(session) {
      let status = 200;
      let passed = false;
      const response = {
        status(code) { status = code; return response; },
        json() { return response; },
      };
      requireStudent({ session }, response, () => { passed = true; });
      return { status, passed };
    }
    process.stdout.write(JSON.stringify({
      routes,
      guard: {
        student: probe({ studentId: 'S001', role: 'student' }),
        teacher: probe({ studentId: 'T001', role: 'teacher' }),
        missingRole: probe({ studentId: 'S001' }),
        unknownRole: probe({ studentId: 'S001', role: 'admin' }),
        missingSession: probe(undefined),
      },
    }));
  `;
  const env = { ...process.env };
  if (nodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = nodeEnv;

  // Production config intentionally refuses to load without these values. The route inspection
  // does not connect to the database, so isolated placeholders are sufficient.
  if (nodeEnv === 'production') {
    env.SUPABASE_DB_URL = 'postgres://test:test@127.0.0.1:5432/pet-route-test';
    env.SESSION_SECRET = 'pet-route-regression-test-secret';
  }

  const child = spawnSync(process.execPath, ['-e', inspectRouter], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, `router inspection failed in ${nodeEnv}: ${child.stderr}`);
  return JSON.parse(child.stdout);
}

test('unlimited-money route is explicit-development-only and POST-only', () => {
  const routePath = '/dev/unlimited-money';
  const developmentRoutes = routesForEnvironment('development').routes;
  const productionRoutes = routesForEnvironment('production').routes;
  const unsetRoutes = routesForEnvironment(undefined).routes;

  const developmentRoute = developmentRoutes.find((route) => route.path === routePath);
  assert.ok(developmentRoute, 'the developer money route should remain available in explicit development');
  assert.deepEqual(developmentRoute.methods, ['post'], 'developer money must not mutate on GET or other methods');
  assert.ok(
    !productionRoutes.some((route) => route.path === routePath),
    'the developer money route must not be registered in production',
  );
  assert.ok(
    !unsetRoutes.some((route) => route.path === routePath),
    'a missing NODE_ENV must not unlock the developer money route',
  );
});

test('coin-pusher economy routes are student-only POST routes in every environment', () => {
  const routePaths = ['/coin-pusher/play', '/coin-pusher/payout'];
  for (const environment of ['development', 'production']) {
    const routes = routesForEnvironment(environment).routes;
    for (const routePath of routePaths) {
      const route = routes.find((entry) => entry.path === routePath);
      assert.ok(route, `${routePath} must be registered in ${environment}`);
      assert.deepEqual(route.methods, ['post'], `${routePath} must be POST-only in ${environment}`);
      assert.ok(route.handlers.includes('requireStudent'), `${routePath} must require a student in ${environment}`);
    }
  }
});

test('student API guard rejects non-student or malformed sessions', () => {
  const guard = routesForEnvironment('production').guard;
  assert.deepEqual(guard.student, { status: 200, passed: true });
  assert.deepEqual(guard.teacher, { status: 403, passed: false });
  assert.deepEqual(guard.missingRole, { status: 403, passed: false });
  assert.deepEqual(guard.unknownRole, { status: 403, passed: false });
  assert.deepEqual(guard.missingSession, { status: 401, passed: false });
});
