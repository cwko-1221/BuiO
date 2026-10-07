// Standalone browser ESM. Load classroom-audience.css separately in the host page.
const GROUP_FIELDS = ['chineseGroup', 'englishGroup', 'mathGroup'];
let nextEditorId = 0;

function label(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function labels(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(label).filter(Boolean))];
}

/** Copy rules without dropping empty ranges: an empty range matches everyone. */
export function normalizeAudienceRules(rules = []) {
  return (Array.isArray(rules) ? rules : []).map((rule) => {
    const groupField = GROUP_FIELDS.includes(rule?.groupField) ? rule.groupField : '';
    return {
      classNames: labels(rule?.classNames),
      groupField,
      groupNames: groupField ? labels(rule?.groupNames) : [],
    };
  });
}

function matchesRules(student, rules) {
  return rules.length === 0 || rules.some((rule) => (
    (rule.classNames.length === 0 || rule.classNames.includes(label(student?.className)))
    && (!rule.groupField || rule.groupNames.length === 0
      || rule.groupNames.includes(label(student?.[rule.groupField])))
  ));
}

/** OR between ranges, AND between class and group constraints within a range. */
export function matchesAudienceRules(student, rules = []) {
  return matchesRules(student, normalizeAudienceRules(rules));
}

export function countMatchedStudents(roster, rules = []) {
  const normalized = normalizeAudienceRules(rules);
  const students = Array.isArray(roster?.students) ? roster.students : [];
  return students.filter((student) => matchesRules(student, normalized)).length;
}

/** Only nonempty roster group labels from the chosen classes and subject. */
export function getAudienceGroupNames(roster, rule = {}) {
  const [normalized] = normalizeAudienceRules([rule]);
  if (!normalized.groupField) return [];
  const students = Array.isArray(roster?.students) ? roster.students : [];
  return labels(students
    .filter((student) => normalized.classNames.length === 0
      || normalized.classNames.includes(label(student?.className)))
    .map((student) => student?.[normalized.groupField]));
}

const COPY = {
  'zh-HK': {
    title: '可見學生（選填）',
    help: '預設所有學生都能見到。可按班級及科目組別設定範圍；符合任何一個範圍即可見到。',
    all: '所有學生都能見到',
    restricted: '符合任何一個範圍的學生都能見到；每個範圍內須同時符合班級及組別。',
    count: (matched, total) => `符合範圍：${matched} / ${total} 位學生`,
    range: (number) => `範圍 ${number}`,
    or: '或（符合任何一個範圍即可）',
    add: '新增範圍',
    remove: '移除範圍',
    removeLabel: (number) => `移除範圍 ${number}`,
    classes: '班級（可選多個）',
    allClasses: '未選班級＝所有班級。',
    noClasses: '名冊中沒有班級；未選班級時仍涵蓋所有學生。',
    missingClass: '（名冊中沒有此班級）',
    subject: '科目',
    subjects: ['不限制科目', '中文', '英文', '數學'],
    subjectHelp: '科目用來列出組別；只選科目而不選組別，仍涵蓋這個範圍內的所有學生。',
    groups: '組別（可選多個）',
    allGroups: '未選組別＝所有組別，包括未分組的學生。',
    chooseSubject: '選擇科目後，可選該科的組別。現在不限制組別。',
    noGroups: '這些班級在此科目沒有已命名的組別。',
    missingGroups: (names) => `已選但在這些班級的名冊中找不到的組別：${names}。仍保留此限制。`,
    clearGroups: '清除已選組別（所有組別）',
    clearMissing: '清除名冊中沒有的已選組別',
  },
  'en-US': {
    title: 'Visible to students (optional)',
    help: 'All students can see this by default. Choose classes and subject groups; students in any range can see it.',
    all: 'All students can see this',
    restricted: 'Students in any range can see this. Within each range, both the class and group selections must match.',
    count: (matched, total) => `Matched students: ${matched} / ${total}`,
    range: (number) => `Range ${number}`,
    or: 'OR (match any range)',
    add: 'Add range',
    remove: 'Remove range',
    removeLabel: (number) => `Remove range ${number}`,
    classes: 'Classes (select any)',
    allClasses: 'No classes selected means all classes.',
    noClasses: 'The roster has no class labels. With none selected, all students are included.',
    missingClass: '(not in the roster)',
    subject: 'Subject',
    subjects: ['No subject restriction', 'Chinese', 'English', 'Math'],
    subjectHelp: 'The subject lists its groups. Choosing a subject without groups still includes every student in this range.',
    groups: 'Groups (select any)',
    allGroups: 'No groups selected means all groups, including students without a group.',
    chooseSubject: 'Choose a subject to select its groups. Groups are currently unrestricted.',
    noGroups: 'These classes have no named groups for this subject.',
    missingGroups: (names) => `Selected groups missing from these classes in the roster: ${names}. These restrictions are kept.`,
    clearGroups: 'Clear selected groups (all groups)',
    clearMissing: 'Clear selected groups missing from the roster',
  },
};

/**
 * Mount an independent editor without changing its container's other children.
 * No callback is emitted on mount. User edits emit (copiedRules, matchedCount).
 * Call destroy() before mounting a replacement; load the scoped CSS separately.
 */
export function mountAudienceEditor(container, {
  roster,
  rules = [],
  language = 'zh-HK',
  onChange = () => {},
} = {}) {
  if (!container?.ownerDocument || typeof container.append !== 'function') {
    throw new TypeError('mountAudienceEditor requires a DOM container.');
  }
  const document = container.ownerDocument;
  const locale = /^en(?:-|$)/i.test(language) ? 'en-US' : 'zh-HK';
  const copy = COPY[locale];
  // Keep an owned snapshot: neither input objects nor callback results own state.
  const rosterSnapshot = {
    classes: labels(roster?.classes),
    students: (Array.isArray(roster?.students) ? roster.students : []).map((student) => ({
      className: label(student?.className),
      ...Object.fromEntries(GROUP_FIELDS.map((field) => [field, label(student?.[field])])),
    })),
  };
  const rosterClasses = labels([
    ...rosterSnapshot.classes,
    ...rosterSnapshot.students.map((student) => student.className),
  ]);
  const prefix = `classroom-audience-${++nextEditorId}`;
  const rows = [];
  let nextRowId = 0;
  let destroyed = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    // Roster labels never enter HTML, selectors, or generated element IDs.
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, action) {
    const node = element('button', 'classroom-audience__button', text);
    node.type = 'button';
    node.dataset.audienceAction = action;
    return node;
  }

  function checkbox(value, kind, checked, suffix = '') {
    const choice = element('label', 'classroom-audience__choice');
    const input = element('input');
    input.type = 'checkbox';
    input.value = value;
    input.checked = checked;
    input.dataset.audienceControl = kind;
    choice.append(input, element('span', '', suffix ? `${value} ${suffix}` : value));
    return choice;
  }

  const root = element('section', 'classroom-audience');
  root.lang = locale;
  root.setAttribute('aria-labelledby', `${prefix}-title`);
  root.setAttribute('aria-describedby', `${prefix}-help`);
  const title = element('h3', 'classroom-audience__title', copy.title);
  title.id = `${prefix}-title`;
  const help = element('p', 'classroom-audience__hint', copy.help);
  help.id = `${prefix}-help`;
  const summary = element('p', 'classroom-audience__summary');
  const count = element('p', 'classroom-audience__count');
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  count.setAttribute('aria-atomic', 'true');
  const ranges = element('div', 'classroom-audience__ranges');
  const add = button(copy.add, 'add');
  root.append(title, help, summary, count, ranges, add);

  function getRules() {
    return normalizeAudienceRules(rows.map((row) => row.rule));
  }

  function updateSummary() {
    const current = getRules();
    const unrestricted = current.length === 0 || current.some((rule) => (
      rule.classNames.length === 0 && (!rule.groupField || rule.groupNames.length === 0)
    ));
    summary.textContent = unrestricted ? copy.all : copy.restricted;
    const matched = countMatchedStudents(rosterSnapshot, current);
    count.textContent = copy.count(matched, rosterSnapshot.students.length);
    return matched;
  }

  function notifyChange() {
    const matched = updateSummary();
    // Update internal state and UI before letting a parent handle the edit.
    if (typeof onChange === 'function') onChange(getRules(), matched);
  }

  function updateGroups(row) {
    const available = getAudienceGroupNames(rosterSnapshot, row.rule);
    row.groupChoices.replaceChildren();
    row.groups.disabled = !row.rule.groupField;
    if (!row.rule.groupField) {
      row.groupChoices.append(element('p', 'classroom-audience__hint', copy.chooseSubject));
    } else if (available.length === 0) {
      row.groupChoices.append(element('p', 'classroom-audience__hint', copy.noGroups));
    } else {
      for (const name of available) {
        row.groupChoices.append(checkbox(name, 'group', row.rule.groupNames.includes(name)));
      }
    }
    updateGroupSelection(row);
  }

  function updateGroupSelection(row) {
    const available = getAudienceGroupNames(rosterSnapshot, row.rule);
    const missing = row.rule.groupNames.filter((name) => !available.includes(name));
    row.missing.textContent = missing.length ? copy.missingGroups(missing.join(', ')) : '';
    row.missing.hidden = missing.length === 0;
    row.clearMissing.hidden = missing.length === 0;
    row.clearGroups.hidden = row.rule.groupNames.length === 0;
  }

  function renumberRows() {
    rows.forEach((row, index) => {
      row.legend.textContent = copy.range(index + 1);
      row.remove.setAttribute('aria-label', copy.removeLabel(index + 1));
      row.or.hidden = index === 0;
    });
  }

  function appendRow(rule) {
    const id = String(++nextRowId);
    const rowPrefix = `${prefix}-range-${id}`;
    const wrapper = element('div', 'classroom-audience__range-wrapper');
    const or = element('p', 'classroom-audience__or', copy.or);
    const range = element('fieldset', 'classroom-audience__range');
    range.dataset.audienceRange = id;
    const legend = element('legend');
    const remove = button(copy.remove, 'remove');
    remove.classList.add('classroom-audience__button--remove');
    const grid = element('div', 'classroom-audience__grid');
    const classes = element('fieldset', 'classroom-audience__field');
    const classHelp = element('p', 'classroom-audience__hint', copy.allClasses);
    classHelp.id = `${rowPrefix}-classes-help`;
    classes.setAttribute('aria-describedby', classHelp.id);
    const classChoices = element('div', 'classroom-audience__choices');
    const classNames = labels([...rosterClasses, ...rule.classNames]);
    for (const name of classNames) {
      classChoices.append(checkbox(name, 'class', rule.classNames.includes(name),
        rosterClasses.includes(name) ? '' : copy.missingClass));
    }
    if (classNames.length === 0) {
      classChoices.append(element('p', 'classroom-audience__hint', copy.noClasses));
    }
    classes.append(element('legend', '', copy.classes), classHelp, classChoices);

    const subjectColumn = element('div', 'classroom-audience__subject-column');
    const subjectLabel = element('label', 'classroom-audience__subject-label', copy.subject);
    subjectLabel.htmlFor = `${rowPrefix}-subject`;
    const subject = element('select', 'classroom-audience__subject');
    subject.id = subjectLabel.htmlFor;
    subject.dataset.audienceControl = 'subject';
    ['', ...GROUP_FIELDS].forEach((value, index) => {
      const option = element('option', '', copy.subjects[index]);
      option.value = value;
      subject.append(option);
    });
    subject.value = rule.groupField;
    const subjectHelp = element('p', 'classroom-audience__hint', copy.subjectHelp);
    subjectHelp.id = `${rowPrefix}-subject-help`;
    subject.setAttribute('aria-describedby', subjectHelp.id);
    const groups = element('fieldset', 'classroom-audience__field');
    const groupHelp = element('p', 'classroom-audience__hint', copy.allGroups);
    groupHelp.id = `${rowPrefix}-groups-help`;
    groups.setAttribute('aria-describedby', groupHelp.id);
    const groupChoices = element('div', 'classroom-audience__choices');
    const missing = element('p', 'classroom-audience__warning');
    missing.setAttribute('aria-live', 'polite');
    const clearMissing = button(copy.clearMissing, 'clear-missing');
    const clearGroups = button(copy.clearGroups, 'clear-groups');
    groups.append(element('legend', '', copy.groups), groupHelp, groupChoices,
      missing, clearMissing, clearGroups);
    subjectColumn.append(subjectLabel, subject, subjectHelp, groups);
    grid.append(classes, subjectColumn);
    range.append(legend, remove, grid);
    wrapper.append(or, range);
    const row = { id, rule, wrapper, or, legend, remove, groups, groupChoices,
      missing, clearMissing, clearGroups };
    rows.push(row);
    ranges.append(wrapper);
    updateGroups(row);
    renumberRows();
    return subject;
  }

  function findRow(control) {
    const range = control.closest('[data-audience-range]');
    return rows.find((row) => row.id === range?.dataset.audienceRange);
  }

  function handleChange(event) {
    if (destroyed) return;
    const control = event.target;
    const kind = control.dataset?.audienceControl;
    const row = kind && findRow(control);
    if (!row) return;
    if (kind === 'subject') {
      row.rule.groupField = GROUP_FIELDS.includes(control.value) ? control.value : '';
      // Group labels belong to the old subject and cannot carry into another one.
      row.rule.groupNames = [];
      updateGroups(row);
    } else if (kind === 'class' || kind === 'group') {
      const key = kind === 'class' ? 'classNames' : 'groupNames';
      row.rule[key] = control.checked
        ? labels([...row.rule[key], control.value])
        : row.rule[key].filter((value) => value !== control.value);
      if (kind === 'class') updateGroups(row);
      else updateGroupSelection(row);
    } else return;
    notifyChange();
  }

  function handleClick(event) {
    if (destroyed) return;
    const control = event.target.closest?.('button[data-audience-action]');
    if (!control || !root.contains(control)) return;
    // All editor actions are local, including when mounted inside a form.
    event.preventDefault();
    const action = control.dataset.audienceAction;
    if (action === 'add') {
      appendRow({ classNames: [], groupField: '', groupNames: [] }).focus();
    } else {
      const row = findRow(control);
      if (!row) return;
      if (action === 'remove') {
        const index = rows.indexOf(row);
        rows.splice(index, 1);
        row.wrapper.remove();
        renumberRows();
        (rows[index]?.remove || rows[index - 1]?.remove || add).focus();
      } else if (action === 'clear-groups' || action === 'clear-missing') {
        const available = getAudienceGroupNames(rosterSnapshot, row.rule);
        row.rule.groupNames = action === 'clear-groups' ? []
          : row.rule.groupNames.filter((name) => available.includes(name));
        updateGroups(row);
        row.groups.closest('[data-audience-range]')
          .querySelector('[data-audience-control="subject"]').focus();
      } else return;
    }
    notifyChange();
  }

  function handleKeydown(event) {
    // Leave native select keyboard behavior intact; Enter on a checkbox can
    // trigger implicit form submission in some hosts. Space still toggles it.
    if (event.key === 'Enter' && event.target.matches?.('input[type="checkbox"]')) {
      event.preventDefault();
    }
  }

  normalizeAudienceRules(rules).forEach(appendRow);
  updateSummary();
  root.addEventListener('change', handleChange);
  root.addEventListener('click', handleClick);
  root.addEventListener('keydown', handleKeydown);
  container.append(root);

  return {
    getRules,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener('change', handleChange);
      root.removeEventListener('click', handleClick);
      root.removeEventListener('keydown', handleKeydown);
      root.remove();
    },
  };
}
