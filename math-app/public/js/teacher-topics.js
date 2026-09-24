(function() {
    'use strict';

    const t = window.BuiI18n.t;
    const status = document.getElementById('topic-bank-status');
    const groupsHost = document.getElementById('topic-grade-groups');
    const search = document.getElementById('topic-search');
    const gradeSelect = document.getElementById('topic-grade-select');
    const groupSelect = document.getElementById('topic-group-select');
    const tierSummary = document.getElementById('topic-enabled-tiers');
    const policyCount = document.getElementById('topic-policy-count');
    const policyNote = document.getElementById('topic-policy-note');
    const policyMessage = document.getElementById('topic-policy-message');
    const saveButton = document.getElementById('topic-save');
    const followGradeButton = document.getElementById('topic-follow-grade');
    const tierLabels = {
        bronze: 'm.tierBronze',
        silver: 'm.tierSilver',
        gold: 'm.tierGold',
        diamond: 'm.tierDiamond',
        fire: 'm.tierFire',
        sun: 'm.tierSun',
    };

    let topicEntries = [];
    let panelId = 0;
    let requestId = 0;
    let currentData = null;
    let busy = false;

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
                gradeSelect.disabled = true;
                groupSelect.disabled = true;
                search.disabled = true;
                saveButton.hidden = true;
                return;
            }

            const name = me.student.name || '';
            document.getElementById('teacher-name').textContent = name;
            document.getElementById('teacher-avatar').textContent = name[0] || '?';

            gradeSelect.addEventListener('change', () => loadTopics(gradeSelect.value, ''));
            groupSelect.addEventListener('change', () => loadTopics(gradeSelect.value, groupSelect.value));
            search.addEventListener('input', filterTopics);
            saveButton.addEventListener('click', saveTopics);
            followGradeButton.addEventListener('click', followGradeSettings);
            await loadTopics(gradeSelect.value, '');
        } catch (error) {
            status.textContent = error.message || t('m.topicListFailed');
            console.error('載入題目列表失敗:', error);
        }
    }

    async function loadTopics(className, mathGroup) {
        const thisRequest = ++requestId;
        currentData = null;
        topicEntries = [];
        setControlsDisabled(true);
        setMessage('', '');
        status.hidden = false;
        status.textContent = t('m.topicListLoading');
        groupsHost.replaceChildren();
        try {
            const query = new URLSearchParams({ className, mathGroup });
            const response = await fetch(`/api/stats/teacher/topic-policy?${query}`, {
                credentials: 'include',
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || t('m.topicListFailed'));
            if (thisRequest !== requestId) return;

            currentData = data;
            gradeSelect.value = data.className;
            renderGroupOptions(data.groups || [], data.mathGroup || '');
            renderTierSummary(data.enabledTiers || []);
            policyNote.hidden = true;
            if (data.legacyDefaults) {
                policyNote.textContent = t('m.topicLegacyDefaults');
                policyNote.hidden = false;
            } else if (data.inherited) {
                policyNote.textContent = t('m.topicInherited');
                policyNote.hidden = false;
            }
            followGradeButton.hidden = !data.groupConfigured;
            renderTopics(data.topics || []);
            status.hidden = Boolean((data.topics || []).length);
            search.disabled = false;
            filterTopics();
        } catch (error) {
            if (thisRequest !== requestId) return;
            status.textContent = error.message || t('m.topicListFailed');
            console.error('載入題目設定失敗:', error);
        } finally {
            if (thisRequest === requestId) setControlsDisabled(false);
        }
    }

    function renderGroupOptions(groups, selectedGroup) {
        groupSelect.replaceChildren();
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = t('m.topicGroupAll');
        groupSelect.appendChild(allOption);
        for (const group of groups) {
            const option = document.createElement('option');
            option.value = group;
            option.textContent = group;
            groupSelect.appendChild(option);
        }
        groupSelect.value = groups.includes(selectedGroup) ? selectedGroup : '';
    }

    function renderTierSummary(tiers) {
        tierSummary.replaceChildren();
        const label = document.createElement('span');
        label.className = 'topic-enabled-tiers-label';
        label.textContent = t('m.topicEnabledTiers');
        tierSummary.appendChild(label);
        if (!tiers.length) {
            const none = document.createElement('span');
            none.textContent = '—';
            tierSummary.appendChild(none);
            return;
        }
        for (const tier of tiers) {
            const badge = document.createElement('span');
            badge.className = `topic-tier-badge ${tier.id}`;
            badge.textContent = tierLabels[tier.id] ? t(tierLabels[tier.id]) : tier.name;
            tierSummary.appendChild(badge);
        }
    }

    function renderTopics(topics) {
        groupsHost.replaceChildren();
        topicEntries = [];
        panelId = 0;
        groupsHost.hidden = false;

        if (!topics.length) {
            status.textContent = t('m.topicNoTopics');
            status.hidden = false;
            updateCount();
            return;
        }

        const section = document.createElement('section');
        section.className = 'topic-grade-section';
        const heading = document.createElement('div');
        heading.className = 'topic-grade-heading';
        const title = document.createElement('h2');
        title.textContent = currentData.mathGroup
            ? `${currentData.className} · ${currentData.mathGroup}`
            : `${currentData.className}（${t('m.topicGroupAll')}）`;
        const count = document.createElement('span');
        count.className = 'topic-count';
        count.id = 'topic-section-count';
        heading.append(title, count);

        const cards = document.createElement('div');
        cards.className = 'topic-cards';
        for (const topic of topics) cards.appendChild(createTopicCard(topic));
        section.append(heading, cards);
        groupsHost.appendChild(section);
        updateCount();
    }

    function createTopicCard(topic) {
        const card = document.createElement('article');
        card.className = 'topic-card' + (topic.enabled ? '' : ' disabled');
        card.dataset.search = `${currentData.className} ${currentData.mathGroup} ${topic.name} ${topic.category}`.toLocaleLowerCase();

        const panel = document.createElement('div');
        panel.className = 'topic-examples';
        panel.hidden = true;
        panel.id = `topic-examples-${++panelId}`;

        const head = document.createElement('div');
        head.className = 'topic-card-head';
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
        const tier = document.createElement('span');
        tier.className = `topic-card-tier topic-tier-badge ${topic.tier || ''}`;
        tier.textContent = tierLabels[topic.tier] ? t(tierLabels[topic.tier]) : '';
        const chevron = document.createElement('span');
        chevron.className = 'topic-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '⌄';
        toggle.append(name, category, tier, chevron);

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

        const enableLabel = document.createElement('label');
        enableLabel.className = 'topic-enable';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(topic.enabled);
        checkbox.setAttribute('aria-label', `${t('m.topicEnableLabel')}: ${topic.name}`);
        checkbox.addEventListener('change', () => {
            if (!checkbox.checked && topicEntries.filter(entry => entry.topic.enabled).length === 1) {
                checkbox.checked = true;
                setMessage(t('m.topicAllRequired'), 'error');
                return;
            }
            topic.enabled = checkbox.checked;
            card.classList.toggle('disabled', !topic.enabled);
            setMessage('', '');
            updateCount();
        });
        const enableText = document.createElement('span');
        enableText.textContent = t('m.topicEnableLabel');
        enableLabel.append(checkbox, enableText);
        head.append(toggle, enableLabel);

        card.append(head, panel);
        topicEntries.push({ card, topic });
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
                appendFormattedMathText(question, example.questionText);
                const answer = document.createElement('span');
                answer.className = 'topic-example-answer';
                appendFormattedMathText(answer, `${t('m.exampleAnswer')}${example.answer}`);
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

    function appendFormattedMathText(element, value) {
        element.replaceChildren();
        const text = String(value ?? '');
        const fractionPattern = /(\d+|\?)\s*\/\s*(\d+|\?)/g;
        let cursor = 0;
        let match;
        while ((match = fractionPattern.exec(text)) !== null) {
            if (match.index > cursor) element.appendChild(document.createTextNode(text.slice(cursor, match.index)));
            const fraction = document.createElement('span');
            fraction.className = 'display-fraction';
            fraction.setAttribute('role', 'img');
            fraction.setAttribute('aria-label', t('m.fractionAria', { n: match[1], d: match[2] }));
            const numerator = document.createElement('span');
            numerator.textContent = match[1];
            const line = document.createElement('span');
            line.className = 'display-fraction-line';
            line.setAttribute('aria-hidden', 'true');
            const denominator = document.createElement('span');
            denominator.textContent = match[2];
            fraction.append(numerator, line, denominator);
            element.appendChild(fraction);
            cursor = fractionPattern.lastIndex;
        }
        if (cursor < text.length) element.appendChild(document.createTextNode(text.slice(cursor)));
    }

    function updateCount() {
        const selected = topicEntries.filter(entry => entry.topic.enabled).length;
        const total = topicEntries.length;
        policyCount.textContent = t('m.topicSelectedCount', { selected, total });
        const sectionCount = document.getElementById('topic-section-count');
        if (sectionCount) sectionCount.textContent = t('m.topicCount', { count: total });
        saveButton.disabled = busy || selected === 0 || total === 0;
    }

    async function saveTopics() {
        if (!currentData || busy) return;
        const disabledTags = topicEntries.filter(entry => !entry.topic.enabled).map(entry => entry.topic.tag);
        if (disabledTags.length === topicEntries.length) {
            setMessage(t('m.topicAllRequired'), 'error');
            return;
        }
        await persistRule(disabledTags);
    }

    async function followGradeSettings() {
        if (!currentData || busy || !currentData.mathGroup) return;
        await persistRule(null);
    }

    async function persistRule(disabledTags) {
        const selectedGrade = currentData.className;
        const selectedGroup = currentData.mathGroup;
        busy = true;
        setControlsDisabled(true);
        setMessage(t('m.saving'), '');
        try {
            const response = await fetch('/api/stats/teacher/topic-policy', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    className: selectedGrade,
                    mathGroup: selectedGroup,
                    disabledTags,
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || t('m.saveFailedDot'));
            currentData = data;
            renderGroupOptions(data.groups || [], data.mathGroup || '');
            renderTierSummary(data.enabledTiers || []);
            followGradeButton.hidden = !data.groupConfigured;
            policyNote.hidden = true;
            if (data.inherited) {
                policyNote.textContent = t('m.topicInherited');
                policyNote.hidden = false;
            }
            renderTopics(data.topics || []);
            filterTopics();
            const label = selectedGroup ? `${selectedGrade} · ${selectedGroup}` : `${selectedGrade}（${t('m.topicGroupAll')}）`;
            setMessage(t('m.savedFor', { label }), 'ok');
        } catch (error) {
            setMessage(error.message || t('m.saveRetry'), 'error');
            console.error('儲存課題設定失敗:', error);
        } finally {
            busy = false;
            setControlsDisabled(false);
            updateCount();
        }
    }

    function setControlsDisabled(disabled) {
        gradeSelect.disabled = disabled;
        groupSelect.disabled = disabled;
        search.disabled = disabled;
        if (disabled) saveButton.disabled = true;
        followGradeButton.disabled = disabled;
        for (const checkbox of groupsHost.querySelectorAll('.topic-enable input')) checkbox.disabled = disabled;
        if (!disabled) updateCount();
    }

    function setMessage(text, kind) {
        policyMessage.hidden = !text;
        policyMessage.textContent = text || '';
        policyMessage.className = 'topic-policy-message' + (kind ? ` ${kind}` : '');
    }

    function filterTopics() {
        const query = search.value.trim().toLocaleLowerCase();
        for (const { card } of topicEntries) card.hidden = Boolean(query) && !card.dataset.search.includes(query);
    }
})();
