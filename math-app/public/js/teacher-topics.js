(function() {
    'use strict';

    const t = window.BuiI18n.t;
    const status = document.getElementById('topic-bank-status');
    const groupsHost = document.getElementById('topic-grade-groups');
    const search = document.getElementById('topic-search');
    let topicEntries = [];
    let panelId = 0;

    init();

    async function init() {
        try {
            const meResponse = await fetch('/api/auth/me', { credentials: 'include' });
            if (!meResponse.ok) {
                window.location.href = '/';
                return;
            }
            const me = await meResponse.json();
            if (me.student?.role !== 'teacher') {
                status.textContent = t('m.teacherOnly');
                search.hidden = true;
                return;
            }

            const name = me.student.name || '';
            document.getElementById('teacher-name').textContent = name;
            document.getElementById('teacher-avatar').textContent = name[0] || '?';

            const response = await fetch('/api/quiz/teacher/topics', { credentials: 'include' });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || t('m.topicListFailed'));

            renderGroups(data.groups || []);
            status.hidden = true;
            search.addEventListener('input', filterTopics);
        } catch (error) {
            status.textContent = error.message || t('m.topicListFailed');
            console.error('載入題目列表失敗:', error);
        }
    }

    function renderGroups(groups) {
        groupsHost.replaceChildren();
        topicEntries = [];
        panelId = 0;

        for (const group of groups) {
            const section = document.createElement('section');
            section.className = 'topic-grade-section';

            const heading = document.createElement('div');
            heading.className = 'topic-grade-heading';
            const title = document.createElement('h2');
            title.textContent = group.grade;
            const count = document.createElement('span');
            count.className = 'topic-count';
            count.textContent = t('m.topicCount', { count: group.topics.length });
            heading.append(title, count);

            const cards = document.createElement('div');
            cards.className = 'topic-cards';
            for (const topic of group.topics) {
                cards.appendChild(createTopicCard(topic, group.grade));
            }

            section.append(heading, cards);
            groupsHost.appendChild(section);
        }
    }

    function createTopicCard(topic, grade) {
        const card = document.createElement('article');
        card.className = 'topic-card';
        card.dataset.search = `${grade} ${topic.name} ${topic.category}`.toLocaleLowerCase();

        const panel = document.createElement('div');
        panel.className = 'topic-examples';
        panel.hidden = true;
        panel.id = `topic-examples-${++panelId}`;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'topic-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', panel.id);

        const name = document.createElement('span');
        name.className = 'topic-name';
        name.textContent = topic.name;
        const category = document.createElement('span');
        category.className = 'topic-category';
        category.textContent = topic.category;
        const chevron = document.createElement('span');
        chevron.className = 'topic-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '⌄';
        toggle.append(name, category, chevron);

        toggle.addEventListener('click', async () => {
            const opening = panel.hidden;
            panel.hidden = !opening;
            toggle.setAttribute('aria-expanded', String(opening));
            card.classList.toggle('open', opening);
            chevron.textContent = opening ? '⌃' : '⌄';
            if (opening && !card.dataset.loaded && !card.dataset.loading) {
                await loadExamples(topic.tag, card, panel);
            }
        });

        card.append(toggle, panel);
        topicEntries.push(card);
        return card;
    }

    async function loadExamples(tag, card, panel) {
        card.dataset.loading = '1';
        panel.replaceChildren();
        const loading = document.createElement('p');
        loading.className = 'topic-examples-status';
        loading.textContent = t('m.examplesLoading');
        panel.appendChild(loading);

        try {
            const response = await fetch(`/api/quiz/teacher/topics/${encodeURIComponent(tag)}/examples`, {
                credentials: 'include',
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || t('m.examplesFailed'));

            const list = document.createElement('ol');
            list.className = 'topic-example-list';
            for (const [index, example] of data.examples.entries()) {
                const item = document.createElement('li');
                const number = document.createElement('span');
                number.className = 'topic-example-number';
                number.textContent = t('m.exampleNumber', { n: index + 1 });
                const question = document.createElement('span');
                question.className = 'topic-example-question';
                question.textContent = example.questionText;
                const answer = document.createElement('span');
                answer.className = 'topic-example-answer';
                answer.textContent = `${t('m.exampleAnswer')}${example.answer}`;
                item.append(number, question, answer);
                list.appendChild(item);
            }
            panel.replaceChildren(list);
            card.dataset.loaded = '1';
        } catch (error) {
            const failed = document.createElement('p');
            failed.className = 'topic-examples-status error';
            failed.textContent = error.message || t('m.examplesFailed');
            panel.replaceChildren(failed);
            console.error('載入課題例題失敗:', error);
        } finally {
            delete card.dataset.loading;
        }
    }

    function filterTopics() {
        const query = search.value.trim().toLocaleLowerCase();
        for (const card of topicEntries) {
            card.hidden = query && !card.dataset.search.includes(query);
        }
        for (const section of groupsHost.children) {
            const visible = [...section.querySelectorAll('.topic-card')].some(card => !card.hidden);
            section.hidden = !visible;
        }
    }
})();
