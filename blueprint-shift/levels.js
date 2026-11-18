(function () {
    'use strict';

    const parts = [
        { name: 'квадрат', mark: '■', color: '#f5ba63' },
        { name: 'круг', mark: '●', color: '#79ded1' },
        { name: 'ромб', mark: '◆', color: '#bcadff' },
        { name: 'треугольник', mark: '▲', color: '#ff9388' }
    ];

    const jobs = [
        { name: 'Крепление фонаря', plans: [[0, 1], [1, 0]], trays: [2, 1] },
        { name: 'Муфта редуктора', plans: [[0, 2, 1], [2, 1, 0], [1, 0, 2]], trays: [3, 1] },
        { name: 'Направляющая лифта', plans: [[1, 2, 1, 0], [0, 1, 0], [2, 0, 2]], trays: [2, 2] },
        { name: 'Датчик давления', plans: [[3, 0, 1], [1, 3, 2, 1], [2, 0, 3, 2]], trays: [3, 2] },
        { name: 'Шпиндель станка', plans: [[0, 2, 3, 1], [2, 1, 3], [1, 3, 0], [3, 0, 2]], trays: [3, 1] },
        { name: 'Привод шлюза', plans: [[3, 2, 0, 3], [0, 1, 2, 0], [2, 3, 1, 2], [1, 0, 3, 1]], trays: [2, 2] }
    ];

    const clone = board => board.map(stack => stack.slice());
    const keyOf = board => JSON.stringify(board);
    const matches = (stack, plan) => stack.every((part, index) => part === plan[index]);
    const capacity = (job, index) => job.plans[index]?.length ?? job.trays[index - job.plans.length];

    function canPlace(job, stack, index, part) {
        if (stack.length >= capacity(job, index)) return false;
        const plan = job.plans[index];
        return !plan || (matches(stack, plan) && plan[stack.length] === part);
    }

    function canMove(job, board, from, to) {
        return from !== to && board[from].length > 0 &&
            canPlace(job, board[to], to, board[from].at(-1));
    }

    function move(board, from, to) {
        board[to].push(board[from].pop());
    }

    function solved(job, board) {
        return job.plans.every((plan, index) =>
            board[index].length === plan.length && matches(board[index], plan)) &&
            board.slice(job.plans.length).every(stack => !stack.length);
    }

    function generate(level) {
        const template = jobs[(level - 1) % jobs.length];
        const rotation = Math.floor((level - 1) / jobs.length) % parts.length;
        const job = {
            ...template,
            plans: template.plans.map(plan => plan.map(part => (part + rotation) % parts.length))
        };
        let seed = (Math.imul(level, 7919) + 17) | 0;
        const random = limit => {
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
            return Math.floor((seed >>> 0) / 4294967296 * limit);
        };
        const finished = [...job.plans, ...job.trays.map(() => [])];

        if (level === 1) {
            const board = clone(finished);
            move(board, 0, 2);
            move(board, 1, 0);
            return { job, board, solution: [[0, 1], [2, 0]] };
        }

        const target = Math.min(20, 5 + Math.min(level, 12) + job.plans.length);
        for (let attempt = 0; attempt < 30; attempt++) {
            const board = clone(finished);
            const solution = [];
            const visited = new Set([keyOf(board)]);
            for (let step = 0; step < target; step++) {
                const candidates = [];
                for (let from = 0; from < board.length; from++) {
                    const part = board[from].pop();
                    if (part === undefined) continue;
                    if (canPlace(job, board[from], from, part)) {
                        for (let to = 0; to < board.length; to++) {
                            if (from === to || board[to].length >= capacity(job, to)) continue;
                            board[to].push(part);
                            const key = keyOf(board);
                            board[to].pop();
                            if (!visited.has(key)) candidates.push({ from, to, key });
                        }
                    }
                    board[from].push(part);
                }
                if (!candidates.length) break;
                const { from, to, key } = candidates[random(candidates.length)];
                move(board, from, to);
                visited.add(key);
                solution.push([to, from]);
            }
            const jammed = job.plans.some((plan, index) => !matches(board[index], plan));
            if (jammed && solution.length >= 5 && board.slice(job.plans.length).some(stack => stack.length)) {
                return { job, board, solution: solution.reverse() };
            }
        }

        // Move one part to a tray to make room for a part from a second assembly.
        const board = clone(finished);
        const tray = job.plans.length;
        move(board, 0, tray);
        move(board, 1, 0);
        return { job, board, solution: [[0, 1], [tray, 0]] };
    }

    const api = { parts, clone, keyOf, matches, capacity, canMove, move, solved, generate };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else window.Blueprints = api;
})();

