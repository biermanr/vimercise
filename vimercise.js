import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { vim, Vim, getCM } from 'https://cdn.jsdelivr.net/npm/@replit/codemirror-vim@6.3.0/dist/index.js';

let exercises = [];
let currentExerciseIndex = 0;
let keystrokeCount = 0;
let isSuccess = false;

// localStorage key
const STORAGE_KEY = 'vimercise-progress';

// Load progress from localStorage
function loadProgress() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { version: 1, exercises: {} };

    try {
        return JSON.parse(stored);
    } catch (e) {
        console.error('Failed to parse progress:', e);
        return { version: 1, exercises: {} };
    }
}

// Save progress to localStorage
function saveProgress(progressData) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progressData));
    } catch (e) {
        console.error('Failed to save progress:', e);
    }
}

// Update exercise progress (only save if better or first solve)
function updateExerciseProgress(exerciseName, keystrokeCount) {
    const progress = loadProgress();
    const existing = progress.exercises[exerciseName];

    // Only update if this is a new best or first completion
    if (!existing || !existing.solved || keystrokeCount < existing.minKeystrokes) {
        progress.exercises[exerciseName] = {
            minKeystrokes: keystrokeCount,
            solved: true,
            lastAttempt: new Date().toISOString()
        };
        saveProgress(progress);
        renderProgressTable();
    }
}

// Render the progress table
function renderProgressTable() {
    const tbody = document.getElementById('progress-table-body');
    if (!tbody) return; // Guard for initial load

    const progress = loadProgress();
    tbody.innerHTML = '';

    exercises.forEach((exercise, index) => {
        const row = document.createElement('tr');
        row.className = 'progress-row';
        if (index === currentExerciseIndex) {
            row.classList.add('active');
        }
        row.dataset.exerciseIndex = index;

        const exerciseData = progress.exercises[exercise.name];

        const categoryCell = document.createElement('td');
        categoryCell.className = 'category';
        categoryCell.textContent = exercise.category || '';

        const nameCell = document.createElement('td');
        nameCell.className = 'exercise-name';
        nameCell.textContent = exercise.name;

        const keystrokesCell = document.createElement('td');
        keystrokesCell.className = 'keystrokes';

        if (exerciseData && exerciseData.solved) {
            const badge = document.createElement('span');
            badge.className = 'keystroke-badge';
            badge.textContent = exerciseData.minKeystrokes;
            keystrokesCell.appendChild(badge);
        } else {
            const icon = document.createElement('span');
            icon.className = 'unsolved-icon';
            icon.textContent = '☐';
            keystrokesCell.appendChild(icon);
        }

        row.appendChild(categoryCell);
        row.appendChild(nameCell);
        row.appendChild(keystrokesCell);

        tbody.appendChild(row);
    });

    // Add click handlers for navigation
    tbody.querySelectorAll('.progress-row').forEach(row => {
        row.addEventListener('click', () => {
            const index = parseInt(row.dataset.exerciseIndex);
            currentExerciseIndex = index;
            loadExercise(currentExerciseIndex);
        });
    });
}

// Clear all progress
function clearProgress() {
    if (confirm('Clear all progress? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        renderProgressTable();
    }
}

// Compartment for controlling read-only state
const readOnlyCompartment = new Compartment();

// Get the editor wrapper elements
const editorWrappers = document.querySelectorAll('.editor-section .editor-wrapper');
const startingWrapper = editorWrappers[0];
const targetWrapper = editorWrappers[1];

// Parse text and extract cursor position (marked with |)
function parseTextWithCursor(text) {
    const cursorIndex = text.indexOf('|');
    if (cursorIndex === -1) {
        return { text, cursorPos: null };
    }
    return {
        text: text.replace('|', ''),
        cursorPos: cursorIndex
    };
}

// Get current exercise
function getCurrentExercise() {
    return exercises[currentExerciseIndex];
}

// Check if user is in normal mode
function isInNormalMode(view) {
    const cm = getCM(view);
    if (!cm) return true; // Default to true if we can't get vim state

    const vimState = cm.state.vim;
    if (!vimState) return true;

    // User is in normal mode if NOT in insert, visual, or replace mode
    return !vimState.insertMode && !vimState.visualMode && cm.state.keyMap !== 'vim-replace';
}

// Function to check if text and cursor position match target
function checkSuccess(view) {
    const exercise = getCurrentExercise();
    const targetParsed = parseTextWithCursor(exercise.target);
    const currentText = view.state.doc.toString();
    const currentCursorPos = view.state.selection.main.head;

    const textMatches = currentText === targetParsed.text;

    // Normalize cursor position (vim normal mode can't be after last char)
    let expectedCursorPos = targetParsed.cursorPos;
    if (expectedCursorPos !== null && expectedCursorPos >= targetParsed.text.length && targetParsed.text.length > 0) {
        expectedCursorPos = targetParsed.text.length - 1;
    }

    const cursorMatches = expectedCursorPos === null || currentCursorPos === expectedCursorPos;
    const inNormalMode = isInNormalMode(view);

    if (textMatches && cursorMatches && inNormalMode) {
        if (!isSuccess) {
            isSuccess = true;
            startingWrapper.classList.add('success');
            targetWrapper.classList.add('success');

            // Make editor read-only and blur it
            view.dispatch({
                effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(true))
            });

            // Remove focus from the editor
            view.contentDOM.blur();

            // Save progress
            updateExerciseProgress(exercise.name, keystrokeCount);
        }
    } else {
        if (isSuccess) {
            isSuccess = false;
            startingWrapper.classList.remove('success');
            targetWrapper.classList.remove('success');

            // Re-enable editing
            view.dispatch({
                effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(false))
            });

            // Restore focus to the editor
            view.focus();
        }
    }
}

// Update keystroke counter
function updateKeystrokeCount() {
    document.getElementById('keystroke-count').textContent = keystrokeCount;
}

// Extension to block mouse cursor positioning
const blockMouseSelection = EditorView.domEventHandlers({
    mousedown: (event, view) => {
        // If success is achieved, don't allow any interaction
        if (isSuccess) {
            event.preventDefault();
            event.stopPropagation();
            return true;
        }

        // Prevent the default mousedown behavior that sets cursor position
        event.preventDefault();
        // Keep focus on the editor
        view.focus();
        return true;
    },
    focus: (event, view) => {
        // Prevent focus if success is achieved
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
        // Block all keys if success is achieved
        if (isSuccess) {
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        return false;
    }
});

// Create the editable editor with Vim bindings
let editorView;
function createEditor(text, cursorPos) {
    const parent = document.getElementById('editor');
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

    // Add keystroke tracking at the DOM level using capture phase
    // This ensures we catch keystrokes before Vim processes them
    editorView.dom.addEventListener('keydown', (event) => {
        // Don't count if success is achieved
        if (isSuccess) return;

        // Don't count modifier keys alone
        if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(event.key)) {
            keystrokeCount++;
            updateKeystrokeCount();
        }
    }, true); // true = use capture phase

    return editorView;
}

// Create the read-only target display
let targetView;
function createTargetView(textWithMarker) {
    const parent = document.getElementById('target');
    if (targetView) {
        targetView.destroy();
    }

    // Parse to get cursor position and clean text
    const parsed = parseTextWithCursor(textWithMarker);
    const { text, cursorPos } = parsed;

    // Create decorations for cursor highlight
    const decorations = [];
    if (cursorPos !== null) {
        // In vim normal mode, cursor is always ON a character
        // If cursor is at/after end, show it on the last character
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
const vimModeElement = document.getElementById('vim-mode');

function updateVimMode() {
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

// Load an exercise
function loadExercise(index) {
    const exercise = exercises[index];
    const startingParsed = parseTextWithCursor(exercise.starting);

    // Normalize starting cursor position for vim normal mode
    let startingCursorPos = startingParsed.cursorPos;
    if (startingCursorPos !== null && startingCursorPos >= startingParsed.text.length && startingParsed.text.length > 0) {
        startingCursorPos = startingParsed.text.length - 1;
    }

    // Reset keystroke counter and success state
    keystrokeCount = 0;
    isSuccess = false;
    updateKeystrokeCount();

    // Remove success state from both wrappers
    startingWrapper.classList.remove('success');
    targetWrapper.classList.remove('success');

    // Update exercise name in header
    document.getElementById('exercise-name').textContent = `Exercise: ${exercise.description}`;

    // Update hint text and reset to collapsed state
    const hintElement = document.getElementById('hint-text');
    const hintToggle = document.getElementById('hint-toggle');
    if (hintElement) {
        hintElement.textContent = exercise.hint || 'No hint available for this exercise.';
        // Reset hint to collapsed state
        hintElement.classList.add('hint-hidden');
        if (hintToggle) {
            hintToggle.classList.remove('expanded');
        }
    }

    // Create editors - target highlights the cursor position
    createEditor(startingParsed.text, startingCursorPos);
    createTargetView(exercise.target);

    // Set up event listener for vim mode updates
    editorView.dom.addEventListener('keyup', updateVimMode);

    // Focus the editor
    editorView.focus();
    updateVimMode();

    // Update sidebar active state
    renderProgressTable();
}

// Initialize the application
async function init() {
    try {
        // Load exercises from JSON file
        const response = await fetch('exercises.json');
        if (!response.ok) {
            throw new Error(`Failed to load exercises: ${response.statusText}`);
        }
        exercises = await response.json();

        // Reset button functionality
        document.getElementById('reset-btn').addEventListener('click', () => {
            loadExercise(currentExerciseIndex);
        });

        // Initial load
        loadExercise(0);

        // Initialize progress sidebar
        renderProgressTable();

        // Clear progress button handler
        document.getElementById('clear-progress-btn').addEventListener('click', clearProgress);

        // Hint toggle functionality
        const hintToggle = document.getElementById('hint-toggle');
        const hintText = document.getElementById('hint-text');
        if (hintToggle && hintText) {
            hintToggle.addEventListener('click', () => {
                hintToggle.classList.toggle('expanded');
                hintText.classList.toggle('hint-hidden');
            });
        }
    } catch (error) {
        console.error('Error initializing Vimercise:', error);
        alert('Failed to load exercises. Please make sure exercises.json is available.');
    }
}

// Start the application
init();
