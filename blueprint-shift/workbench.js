(() => {
    'use strict';

    const { parts, clone, keyOf, matches, capacity, canMove, move, solved, generate } = window.Blueprints;
    const $ = id => document.getElementById(id);
    const storeKey = 'blueprint-shift-level';
    let level, job, board, original, route, past, selected, hinted, won;
    let showReward;
    let watchingAd = false;

    function partRow(values, length, plan = false) {
        const row = document.createElement('span');
        row.className = 'part-row';
        row.setAttribute('aria-hidden', 'true');
        for (let index = 0; index < length; index++) {
            const cell = document.createElement('span');
            const part = parts[values[index]];
            cell.className = 'part';
            if (part) {
                cell.textContent = part.mark;
                cell.style.setProperty('--part', part.color);
                if (plan) cell.classList.add('plan');
                else if (index === values.length - 1) cell.classList.add('top');
            } else {
                cell.classList.add('empty');
            }
            row.append(cell);
        }
        return row;
    }

    function placeName(index) {
        return index < job.plans.length
            ? 'Узел ' + (index + 1)
            : 'Лоток ' + (index + 1 - job.plans.length);
    }

    function render(message = '') {
        $('stations').replaceChildren();
        $('trays').replaceChildren();
        let assembled = 0;
        board.forEach((stack, index) => {
            const plan = job.plans[index];
            const size = capacity(job, index);
            const button = document.createElement('button');
            const title = document.createElement('span');
            const indicator = document.createElement('small');
            button.type = 'button';
            button.disabled = watchingAd;
            button.className = 'place';
            title.className = 'place-title';
            indicator.textContent = stack.length + '/' + size;
            title.append(placeName(index), indicator);
            button.append(title);
            const names = values => values.map(part => parts[part].name).join(', ') || 'пусто';
            button.setAttribute('aria-label', placeName(index) + '. Детали: ' + names(stack) +
                (plan ? '. Чертёж: ' + names(plan) : '. Вместимость: ' + size));
            button.setAttribute('aria-pressed', selected === index);
            if (plan) {
                const correct = matches(stack, plan);
                if (!correct) button.classList.add('jammed');
                if (correct && stack.length === size) {
                    assembled++;
                    button.classList.add('complete');
                }
                button.append(partRow(plan, size, true));
            } else {
                button.classList.add('tray');
            }
            if (selected === index) button.classList.add('selected');
            if (hinted === index || (selected >= 0 && canMove(job, board, selected, index))) {
                button.classList.add('target');
            }
            button.append(partRow(stack, size));
            button.addEventListener('click', () => {
                const hadFocus = document.activeElement === button && button.matches(':focus-visible');
                tap(index);
                if (hadFocus) document.querySelectorAll('.place')[index]?.focus();
            });
            (plan ? $('stations') : $('trays')).append(button);
        });
        $('job').textContent = job.name;
        $('level').textContent = level;
        $('moves').textContent = past.length;
        $('progress').textContent = 'Готово ' + assembled + '/' + job.plans.length;
        $('status').textContent = won ? 'Заказ выполнен. Все узлы совпадают с чертежом.' : message;
        $('undo').disabled = watchingAd || past.length === 0 || won;
        $('hint').disabled = watchingAd || won;
        $('restart').disabled = watchingAd;
        $('next').hidden = !won;
        $('reward').hidden = !showReward || won;
        $('reward').disabled = watchingAd || !route.has(keyOf(board));
    }

    function applyMove(from, to) {
        past.push(clone(board));
        move(board, from, to);
        selected = hinted = -1;
        won = solved(job, board);
        if (won) save(level + 1);
        render();
        if (won) $('next').focus();
    }

    function tap(index) {
        if (won || watchingAd) return;
        hinted = -1;
        if (index === selected) {
            selected = -1;
            render();
        } else if (selected >= 0 && canMove(job, board, selected, index)) {
            applyMove(selected, index);
        } else {
            const rejected = selected >= 0;
            selected = board[index].length ? index : -1;
            render(rejected ? 'Деталь не подходит или место занято.' : '');
        }
    }

    function reset() {
        board = clone(original);
        past = [];
        selected = hinted = -1;
        won = false;
        render(level === 1 ? 'Верхний ряд — чертёж. Нижний — детали, которые стоят сейчас.' : '');
    }

    function save(order) {
        try { localStorage.setItem(storeKey, String(order)); } catch {}
    }

    function start(order) {
        level = order;
        const generated = generate(level);
        job = generated.job;
        original = generated.board;
        route = new Map();
        const current = clone(original);
        for (const [from, to] of generated.solution) {
            route.set(keyOf(current), [from, to]);
            move(current, from, to);
        }
        save(level);
        reset();
    }

    $('undo').onclick = () => {
        if (!past.length || won) return;
        board = past.pop();
        selected = hinted = -1;
        render();
    };
    $('restart').onclick = reset;
    $('next').onclick = () => {
        start(level + 1);
        document.querySelector('.place').focus();
    };
    $('hint').onclick = () => {
        const step = route.get(keyOf(board));
        if (!step) {
            render('Отмени ход, чтобы вернуться к известному решению.');
            return;
        }
        [selected, hinted] = step;
        render(placeName(selected) + ' → ' + placeName(hinted));
    };
    $('reward').onclick = async () => {
        const step = route.get(keyOf(board));
        if (!showReward || !step || watchingAd || won) return;
        watchingAd = true;
        render('Ожидаем ответ рекламного сервиса…');
        let outcome;
        try {
            outcome = await showReward();
        } catch {
            outcome = 'unavailable';
        } finally {
            watchingAd = false;
        }
        if (outcome === 'rewarded') {
            applyMove(...step);
        } else {
            render(outcome === 'cancelled'
                ? 'Реклама закрыта. Детали остались на месте.'
                : 'Реклама сейчас недоступна. Можно продолжить вручную.');
        }
    };
    document.addEventListener('contextmenu', event => event.preventDefault());

    let order = 1;
    try {
        const stored = Number(localStorage.getItem(storeKey));
        if (Number.isSafeInteger(stored) && stored > 0 && stored < Number.MAX_SAFE_INTEGER) order = stored;
    } catch {}
    start(order);

    if (window.BlueprintPlatform) {
        window.BlueprintPlatform.init().then(reward => {
            showReward = reward;
            $('reward').hidden = !showReward || won;
            $('reward').disabled = !route.has(keyOf(board));
        }).catch(error => console.warn('Platform SDK unavailable:', error));
    }
})();
