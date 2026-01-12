import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { vim, Vim, getCM } from 'https://cdn.jsdelivr.net/npm/@replit/codemirror-vim@6.3.0/dist/index.js';

let exercises = [];
let currentExerciseIndex = 0;
let keystrokeCount = 0;
let isSuccess = false;

// localStorage keys
const STORAGE_KEY = 'vimercise-progress';
const CUSTOM_EXERCISES_KEY = 'vimercise-custom-exercises';

// Exercise sharing functions
function encodeExercise(exercise) {
    try {
        const json = JSON.stringify(exercise);
        return btoa(unescape(encodeURIComponent(json)));
    } catch (e) {
        console.error('Failed to encode exercise:', e);
        return null;
    }
}

function decodeExercise(code) {
    try {
        const json = decodeURIComponent(escape(atob(code)));
        return JSON.parse(json);
    } catch (e) {
        console.error('Failed to decode exercise:', e);
        return null;
    }
}

// Copy exercise code to clipboard
function copyExerciseCode(exercise) {
    const code = encodeExercise(exercise);
    if (!code) {
        alert('Failed to encode exercise.');
        return;
    }

    navigator.clipboard.writeText(code).then(() => {
        alert('Exercise code copied to clipboard! Share it with others.');
    }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
        // Fallback: show the code in a prompt
        prompt('Copy this exercise code:', code);
    });
}

// Import exercise from code
function importExerciseCode() {
    const code = prompt('Paste the exercise code here:');
    if (!code) return;

    const exercise = decodeExercise(code.trim());
    if (!exercise) {
        alert('Invalid exercise code. Please check and try again.');
        return;
    }

    // Validate exercise structure
    if (!exercise.name || !exercise.description || !exercise.starting || !exercise.target) {
        alert('Invalid exercise format. Missing required fields.');
        return;
    }

    // Mark as custom and imported
    exercise.custom = true;

    // Check if exercise already exists
    const existingIndex = exercises.findIndex(ex =>
        ex.name === exercise.name && ex.starting === exercise.starting && ex.target === exercise.target
    );

    if (existingIndex !== -1) {
        if (!confirm('An exercise with this name and content already exists. Import anyway?')) {
            return;
        }
    }

    // Add to custom exercises in localStorage
    const customExercises = loadCustomExercises();
    customExercises.push(exercise);
    localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(customExercises));

    // Add to exercises array and update UI
    exercises.push(exercise);
    renderProgressTable();

    // Navigate to the imported exercise
    currentExerciseIndex = exercises.length - 1;
    loadExercise(currentExerciseIndex);

    alert('Exercise imported successfully!');
}

// Load custom exercises from localStorage
function loadCustomExercises() {
    const stored = localStorage.getItem(CUSTOM_EXERCISES_KEY);
    if (!stored) return [];

    try {
        return JSON.parse(stored);
    } catch (e) {
        console.error('Failed to parse custom exercises:', e);
        return [];
    }
}

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

// Create Exercise functionality
let startingEditorView = null;
let goalEditorView = null;
let createSectionVisible = false;

// Update Vim mode indicator for create editors
function updateCreateVimMode(view, modeElementId) {
    const modeElement = document.getElementById(modeElementId);
    if (!modeElement) return;

    const cm = getCM(view);
    if (!cm) {
        modeElement.textContent = 'normal';
        modeElement.className = 'vim-mode mode-normal';
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

    modeElement.textContent = mode;
    modeElement.className = 'vim-mode mode-' + mode;
}

// Create an editor for the create exercise section
function createExerciseEditor(parentId, modeElementId) {
    const parent = document.getElementById(parentId);
    if (!parent) return null;

    const editorState = EditorState.create({
        doc: '',
        extensions: [
            vim(),
            basicSetup,
            EditorView.lineWrapping,
        ]
    });

    const view = new EditorView({
        state: editorState,
        parent: parent
    });

    // Set up event listener for vim mode updates
    view.dom.addEventListener('keyup', () => updateCreateVimMode(view, modeElementId));

    // Update mode initially
    updateCreateVimMode(view, modeElementId);

    return view;
}

// Get text with cursor position marker
function getTextWithCursor(view, recordCursor) {
    if (!view) return '';

    const text = view.state.doc.toString();
    if (!recordCursor) {
        return text;
    }

    const cursorPos = view.state.selection.main.head;
    return text.slice(0, cursorPos) + '|' + text.slice(cursorPos);
}

// Toggle create exercise section
function toggleCreateSection(show) {
    const section = document.getElementById('create-exercise-section');
    if (!section) return;

    if (show) {
        section.style.display = 'block';
        createSectionVisible = true;

        // Create editors if they don't exist
        if (!startingEditorView) {
            startingEditorView = createExerciseEditor('starting-editor', 'starting-vim-mode');
        }
        if (!goalEditorView) {
            goalEditorView = createExerciseEditor('goal-editor', 'goal-vim-mode');
        }

        // Focus the first input
        setTimeout(() => {
            document.getElementById('exercise-name-input')?.focus();
        }, 100);

        // Scroll to the section
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        section.style.display = 'none';
        createSectionVisible = false;

        // Clear form inputs
        document.getElementById('exercise-name-input').value = '';
        document.getElementById('exercise-description-input').value = '';
        document.getElementById('exercise-category-input').value = '';
        document.getElementById('exercise-hint-input').value = '';

        // Clear editors
        if (startingEditorView) {
            startingEditorView.dispatch({
                changes: { from: 0, to: startingEditorView.state.doc.length, insert: '' }
            });
        }
        if (goalEditorView) {
            goalEditorView.dispatch({
                changes: { from: 0, to: goalEditorView.state.doc.length, insert: '' }
            });
        }
    }
}

// Save custom exercise
function saveCustomExercise() {
    const name = document.getElementById('exercise-name-input').value.trim();
    const description = document.getElementById('exercise-description-input').value.trim();
    const category = document.getElementById('exercise-category-input').value.trim() || 'Custom';
    const hint = document.getElementById('exercise-hint-input').value.trim();

    // Validate required fields
    if (!name) {
        alert('Please enter an exercise name.');
        document.getElementById('exercise-name-input').focus();
        return;
    }

    if (!description) {
        alert('Please enter an exercise description.');
        document.getElementById('exercise-description-input').focus();
        return;
    }

    // Get checkbox states
    const recordStartingCursor = document.getElementById('record-starting-cursor').checked;
    const recordGoalCursor = document.getElementById('record-goal-cursor').checked;

    // Get text from editors with cursor positions
    const startingText = getTextWithCursor(startingEditorView, recordStartingCursor);
    const targetText = getTextWithCursor(goalEditorView, recordGoalCursor);

    // Validate that there's some content
    if (!startingText.replace('|', '').trim() && !targetText.replace('|', '').trim()) {
        alert('Please enter some text in at least one of the editors.');
        return;
    }

    // Create the exercise object
    const exercise = {
        name,
        starting: startingText,
        target: targetText,
        description,
        category,
        custom: true
    };

    if (hint) {
        exercise.hint = hint;
    }

    // Load existing custom exercises and add the new one
    const customExercises = loadCustomExercises();
    customExercises.push(exercise);
    localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(customExercises));

    // Add to exercises array and update UI
    exercises.push(exercise);
    renderProgressTable();

    // Close the create section
    toggleCreateSection(false);

    // Navigate to the new exercise
    currentExerciseIndex = exercises.length - 1;
    loadExercise(currentExerciseIndex);

    alert('Custom exercise created successfully!');
}

// Initialize the application
async function init() {
    try {
        // Load exercises from JSON file
        const response = await fetch('exercises.json');
        if (!response.ok) {
            throw new Error(`Failed to load exercises: ${response.statusText}`);
        }
        const builtInExercises = await response.json();

        // Load custom exercises and merge with built-in exercises
        const customExercises = loadCustomExercises();
        exercises = [...builtInExercises, ...customExercises];

        // Reset button functionality
        document.getElementById('reset-btn').addEventListener('click', () => {
            loadExercise(currentExerciseIndex);
        });

        // Share button functionality
        document.getElementById('share-btn').addEventListener('click', () => {
            const exercise = getCurrentExercise();
            copyExerciseCode(exercise);
        });

        // Initial load
        loadExercise(0);

        // Initialize progress sidebar
        renderProgressTable();

        // Clear progress button handler
        document.getElementById('clear-progress-btn').addEventListener('click', clearProgress);

        // Create exercise button handler
        document.getElementById('create-exercise-btn').addEventListener('click', () => {
            toggleCreateSection(true);
        });

        // Import exercise button handler
        document.getElementById('import-exercise-btn').addEventListener('click', importExerciseCode);

        // Close create section button handler
        document.getElementById('close-create-btn').addEventListener('click', () => {
            toggleCreateSection(false);
        });

        // Cancel create button handler
        document.getElementById('cancel-create-btn').addEventListener('click', () => {
            toggleCreateSection(false);
        });

        // Save exercise button handler
        document.getElementById('save-exercise-btn').addEventListener('click', saveCustomExercise);

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
