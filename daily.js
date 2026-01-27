import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { vim, Vim, getCM } from 'https://cdn.jsdelivr.net/npm/@replit/codemirror-vim@6.3.0/dist/index.js';

let exercises = [];
let exerciseDateSet = new Set(); // Set of YYYY-MM-DD strings that have exercises
let sortedDates = []; // sorted array of date strings for next/prev navigation
let exercise = null;
let selectedDateStr = null; // currently selected date
let calendarYear = null;
let calendarMonth = null; // 0-indexed
let keystrokeCount = 0;
let isSuccess = false;

// localStorage key for daily progress
const DAILY_PROGRESS_KEY = 'vimercise-daily-progress';

// Compartment for controlling read-only state
const readOnlyCompartment = new Compartment();

// Cursor position marker: ^ indicates cursor should be on the following character
const CURSOR_MARKER = '^';

// Parse text and extract cursor position from ^ marker
function parseTextWithCursor(text) {
    const markerIndex = text.indexOf(CURSOR_MARKER);

    if (markerIndex === -1) {
        return { text, cursorPos: null };
    }

    const cleanText = text.slice(0, markerIndex) + text.slice(markerIndex + 1);
    return { text: cleanText, cursorPos: markerIndex };
}

// Format date as YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Format date for display
function formatDateDisplay(date) {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Load daily progress
function loadDailyProgress() {
    const stored = localStorage.getItem(DAILY_PROGRESS_KEY);
    if (!stored) return {};

    try {
        return JSON.parse(stored);
    } catch (e) {
        console.error('Failed to parse daily progress:', e);
        return {};
    }
}

// Save daily progress
function saveDailyProgress(dateStr, keystrokeCount) {
    const progress = loadDailyProgress();
    const existing = progress[dateStr];

    if (!existing || keystrokeCount < existing.minKeystrokes) {
        progress[dateStr] = {
            minKeystrokes: keystrokeCount,
            solved: true,
            solvedAt: new Date().toISOString()
        };
        localStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify(progress));
    }
}

// Check if user is in normal mode
function isInNormalMode(view) {
    const cm = getCM(view);
    if (!cm) return true;

    const vimState = cm.state.vim;
    if (!vimState) return true;

    return !vimState.insertMode && !vimState.visualMode && cm.state.keyMap !== 'vim-replace';
}

// Editor references
let editorView = null;
let targetView = null;
let startingWrapper = null;
let targetWrapper = null;

// Function to show success prompt
function showSuccessPrompt() {
    let prompt = document.getElementById('success-prompt');
    if (!prompt) {
        prompt = document.createElement('div');
        prompt.id = 'success-prompt';
        prompt.className = 'success-prompt';
        prompt.innerHTML = '<strong>R</strong> retry · <strong>J</strong> next day · <strong>K</strong> prev day';
        startingWrapper.appendChild(prompt);
    }
    prompt.style.display = 'block';
}

// Function to hide success prompt
function hideSuccessPrompt() {
    const prompt = document.getElementById('success-prompt');
    if (prompt) {
        prompt.style.display = 'none';
    }
}

// Function to check if text and cursor position match target
function checkSuccess(view) {
    const finalParsed = parseTextWithCursor(exercise.final);
    const currentText = view.state.doc.toString();
    const currentCursorPos = view.state.selection.main.head;

    const textMatches = currentText === finalParsed.text;

    let expectedCursorPos = finalParsed.cursorPos;
    if (expectedCursorPos !== null && expectedCursorPos >= finalParsed.text.length && finalParsed.text.length > 0) {
        expectedCursorPos = finalParsed.text.length - 1;
    }

    const cursorMatches = expectedCursorPos === null || currentCursorPos === expectedCursorPos;
    const inNormalMode = isInNormalMode(view);

    if (textMatches && cursorMatches && inNormalMode) {
        if (!isSuccess) {
            isSuccess = true;
            startingWrapper.classList.add('success');
            targetWrapper.classList.add('success');

            view.dispatch({
                effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(true))
            });

            view.contentDOM.blur();

            // Save progress
            const today = formatDate(new Date());
            saveDailyProgress(today, keystrokeCount);

            showSuccessPrompt();
        }
    } else {
        if (isSuccess) {
            isSuccess = false;
            startingWrapper.classList.remove('success');
            targetWrapper.classList.remove('success');

            view.dispatch({
                effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(false))
            });

            view.focus();
            hideSuccessPrompt();
        }
    }
}

// Update keystroke counter
function updateKeystrokeCount() {
    const counter = document.getElementById('keystroke-count');
    if (counter) {
        counter.textContent = keystrokeCount;
    }
}

// Extension to block mouse cursor positioning
const blockMouseSelection = EditorView.domEventHandlers({
    mousedown: (event, view) => {
        if (isSuccess) {
            event.preventDefault();
            event.stopPropagation();
            return true;
        }

        event.preventDefault();
        view.focus();
        return true;
    },
    focus: (event, view) => {
        if (isSuccess) {
            view.contentDOM.blur();
            return true;
        }
        return false;
    }
});

// Extension to block keystrokes when success is achieved
const successBlocker = EditorView.domEventHandlers({
    keydown: (event, view) => {
        if (isSuccess) {
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        return false;
    }
});

// Create the editable editor with Vim bindings
function createEditor(text, cursorPos, parent) {
    if (editorView) {
        editorView.destroy();
    }

    const editorState = EditorState.create({
        doc: text,
        extensions: [
            vim(),
            basicSetup,
            EditorView.lineWrapping,
            blockMouseSelection,
            successBlocker,
            readOnlyCompartment.of(EditorState.readOnly.of(false)),
            EditorView.updateListener.of((update) => {
                if (update.docChanged || update.selectionSet) {
                    checkSuccess(update.view);
                }
            }),
        ],
        selection: cursorPos !== null ? { anchor: cursorPos } : undefined
    });

    editorView = new EditorView({
        state: editorState,
        parent: parent
    });

    // Add keystroke tracking
    editorView.dom.addEventListener('keydown', (event) => {
        if (isSuccess) return;

        if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(event.key)) {
            keystrokeCount++;
            updateKeystrokeCount();
        }
    }, true);

    // Set up vim mode updates
    editorView.dom.addEventListener('keyup', updateVimMode);

    return editorView;
}

// Create the read-only target display
function createTargetView(targetText, parent) {
    if (targetView) {
        targetView.destroy();
    }

    const { text, cursorPos } = parseTextWithCursor(targetText);

    const decorations = [];
    if (cursorPos !== null) {
        let highlightPos = cursorPos;
        if (highlightPos >= text.length && text.length > 0) {
            highlightPos = text.length - 1;
        }

        if (highlightPos < text.length) {
            const cursorMark = Decoration.mark({
                class: 'target-cursor'
            });
            decorations.push(cursorMark.range(highlightPos, highlightPos + 1));
        }
    }

    const targetState = EditorState.create({
        doc: text,
        extensions: [
            basicSetup,
            EditorView.lineWrapping,
            EditorState.readOnly.of(true),
            EditorView.decorations.of(Decoration.set(decorations))
        ]
    });

    targetView = new EditorView({
        state: targetState,
        parent: parent
    });

    return targetView;
}

// Update Vim mode indicator
function updateVimMode() {
    const vimModeElement = document.getElementById('vim-mode');
    if (!vimModeElement || !editorView) return;

    const cm = getCM(editorView);
    if (!cm) {
        vimModeElement.textContent = 'normal';
        vimModeElement.className = 'vim-mode mode-normal';
        return;
    }

    const vimState = cm.state.vim;
    let mode = 'normal';

    if (vimState) {
        if (vimState.insertMode) {
            mode = 'insert';
        } else if (vimState.visualMode) {
            mode = 'visual';
        } else if (cm.state.keyMap === 'vim-replace') {
            mode = 'replace';
        }
    }

    vimModeElement.textContent = mode;
    vimModeElement.className = 'vim-mode mode-' + mode;
}

// Load the exercise
function loadExercise() {
    const startParsed = parseTextWithCursor(exercise.start);

    let startCursorPos = startParsed.cursorPos;
    if (startCursorPos !== null && startCursorPos >= startParsed.text.length && startParsed.text.length > 0) {
        startCursorPos = startParsed.text.length - 1;
    }

    keystrokeCount = 0;
    isSuccess = false;
    updateKeystrokeCount();

    startingWrapper.classList.remove('success');
    targetWrapper.classList.remove('success');
    hideSuccessPrompt();

    const editorEl = document.getElementById('editor');
    const targetEl = document.getElementById('target');

    createEditor(startParsed.text, startCursorPos, editorEl);
    createTargetView(exercise.final, targetEl);

    editorView.focus();
    updateVimMode();
}

// Normalize a YAML exercise date (may be Date object or string) to YYYY-MM-DD string
function normalizeExerciseDate(d) {
    if (d instanceof Date) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }
    return String(d);
}

// Render the calendar for a given year/month (0-indexed month)
function renderCalendar(year, month) {
    calendarYear = year;
    calendarMonth = month;

    const container = document.getElementById('calendar');
    const todayStr = formatDate(new Date());

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    // First day of the month and number of days
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = `
        <div class="calendar-nav">
            <button id="cal-prev">&larr;</button>
            <span class="calendar-month-label">${monthNames[month]} ${year}</span>
            <button id="cal-next">&rarr;</button>
        </div>
        <div class="calendar-grid">
            <div class="calendar-dow">Sun</div>
            <div class="calendar-dow">Mon</div>
            <div class="calendar-dow">Tue</div>
            <div class="calendar-dow">Wed</div>
            <div class="calendar-dow">Thu</div>
            <div class="calendar-dow">Fri</div>
            <div class="calendar-dow">Sat</div>
    `;

    // Empty cells before the 1st
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const classes = ['calendar-day'];

        if (exerciseDateSet.has(dateStr)) classes.push('has-exercise');
        if (dateStr === todayStr) classes.push('today');
        if (dateStr === selectedDateStr) classes.push('selected');

        html += `<div class="${classes.join(' ')}" data-date="${dateStr}">${d}</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    // Navigation handlers
    document.getElementById('cal-prev').addEventListener('click', () => {
        let m = month - 1, y = year;
        if (m < 0) { m = 11; y--; }
        renderCalendar(y, m);
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        let m = month + 1, y = year;
        if (m > 11) { m = 0; y++; }
        renderCalendar(y, m);
    });

    // Day click handlers
    container.querySelectorAll('.calendar-day.has-exercise').forEach(el => {
        el.addEventListener('click', () => {
            selectDate(el.dataset.date);
        });
    });
}

// Select a date and load its exercise
function selectDate(dateStr) {
    const ex = exercises.find(e => normalizeExerciseDate(e.date) === dateStr);
    if (!ex) return;

    selectedDateStr = dateStr;
    exercise = ex;

    // Update date display
    const parts = dateStr.split('-');
    const displayDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    document.getElementById('daily-date').textContent = formatDateDisplay(displayDate);

    // Re-render calendar to update selected highlight
    renderCalendar(calendarYear, calendarMonth);

    // Render and load the exercise
    renderExerciseUI(ex);
    loadExercise();

    // Switch calendar month if selected date is in a different month
    const parts2 = dateStr.split('-');
    const selYear = Number(parts2[0]);
    const selMonth = Number(parts2[1]) - 1;
    if (selYear !== calendarYear || selMonth !== calendarMonth) {
        renderCalendar(selYear, selMonth);
    }
}

// Navigate to the next exercise date (by sorted order)
function selectNextDate() {
    if (!selectedDateStr) return;
    const idx = sortedDates.indexOf(selectedDateStr);
    if (idx === -1 || idx >= sortedDates.length - 1) return;
    selectDate(sortedDates[idx + 1]);
}

// Navigate to the previous exercise date (by sorted order)
function selectPrevDate() {
    if (!selectedDateStr) return;
    const idx = sortedDates.indexOf(selectedDateStr);
    if (idx <= 0) return;
    selectDate(sortedDates[idx - 1]);
}

// Render the exercise UI
function renderExerciseUI(ex) {
    const container = document.getElementById('exercise-content');

    container.innerHTML = `
        <div class="editor-section">
            <div class="editor-header">
                <h2 id="exercise-name">Exercise: ${ex.description}</h2>
                <div class="editor-controls">
                    <button id="reset-btn">Reset</button>
                    <div class="keystroke-counter">
                        Keystrokes: <strong id="keystroke-count">0</strong>
                    </div>
                </div>
            </div>
            <div class="editor-wrapper" id="starting-wrapper">
                <div id="editor"></div>
            </div>
            <br>
            <div class="vim-mode-wrapper">
                <span id="vim-mode" class="vim-mode mode-normal">Normal</span>
            </div>
        </div>

        <div class="editor-section">
            <h2>Target Text</h2>
            <div class="editor-wrapper" id="target-wrapper">
                <div id="target"></div>
            </div>
        </div>

        <div class="editor-section hint-section">
            <h2 id="hint-toggle" class="hint-toggle">
                Hint
                <span class="hint-toggle-icon">&#9654;</span>
            </h2>
            <p id="hint-text" class="hint-text hint-hidden">${ex.hint || 'No hint available for this exercise.'}</p>
        </div>
    `;

    // Get wrapper references
    startingWrapper = document.getElementById('starting-wrapper');
    targetWrapper = document.getElementById('target-wrapper');

    // Set up reset button
    document.getElementById('reset-btn').addEventListener('click', loadExercise);

    // Set up hint toggle
    const hintToggle = document.getElementById('hint-toggle');
    const hintText = document.getElementById('hint-text');
    hintToggle.addEventListener('click', () => {
        hintToggle.classList.toggle('expanded');
        hintText.classList.toggle('hint-hidden');
    });
}

// Render no exercise message
function renderNoExercise() {
    const container = document.getElementById('exercise-content');
    container.innerHTML = `
        <div class="no-exercise">
            <h2>No exercise for today</h2>
            <p>Check back tomorrow for a new daily Vim challenge!</p>
            <p style="margin-top: 20px;">
                <a href="index.html">Practice with all exercises</a>
            </p>
        </div>
    `;
}

// Initialize the application
async function init() {
    try {
        // Set the date display
        const today = new Date();
        document.getElementById('daily-date').textContent = formatDateDisplay(today);

        // Load exercises from YAML file
        const response = await fetch('daily_exercises.yaml');
        if (!response.ok) {
            throw new Error(`Failed to load exercises: ${response.statusText}`);
        }
        const yamlText = await response.text();
        exercises = jsyaml.load(yamlText);

        // Build date lookup set and sorted list
        const allDates = exercises.map(ex => normalizeExerciseDate(ex.date));
        exerciseDateSet = new Set(allDates);
        sortedDates = [...exerciseDateSet].sort();

        // Render calendar for current month
        renderCalendar(today.getFullYear(), today.getMonth());

        // Try to load today's exercise
        const todayStr = formatDate(today);
        if (exerciseDateSet.has(todayStr)) {
            selectDate(todayStr);
        } else {
            renderNoExercise();
        }

        // Global keyboard handler for retry / next / prev
        document.addEventListener('keydown', (event) => {
            if (!isSuccess) return;

            if (event.key === 'r' || event.key === 'R') {
                event.preventDefault();
                loadExercise();
            } else if (event.key === 'j' || event.key === 'J') {
                event.preventDefault();
                selectNextDate();
            } else if (event.key === 'k' || event.key === 'K') {
                event.preventDefault();
                selectPrevDate();
            }
        });
    } catch (error) {
        console.error('Error initializing Daily Vimercise:', error);
        const container = document.getElementById('exercise-content');
        container.innerHTML = `
            <div class="no-exercise">
                <h2>Error loading exercises</h2>
                <p>Please make sure daily_exercises.yaml is available.</p>
            </div>
        `;
    }
}

// Start the application
init();
