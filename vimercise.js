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

// Exercise sharing functions using individual query parameters
function buildShareUrl(exercise) {
    try {
        const params = new URLSearchParams();

        // Required fields (cursor positions are encoded in the text via underlined characters)
        params.set('n', exercise.name);
        params.set('d', exercise.description);
        params.set('st', exercise.start);
        params.set('tt', exercise.final);

        // Optional fields
        if (exercise.category) {
            params.set('c', exercise.category);
        }
        if (exercise.hint) {
            params.set('h', exercise.hint);
        }

        const baseUrl = window.location.origin + window.location.pathname;
        return `${baseUrl}?${params.toString()}`;
    } catch (e) {
        console.error('Failed to build share URL:', e);
        return null;
    }
}

function parseExerciseFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);

        // Check if we have exercise parameters
        if (!params.has('n') || !params.has('st') || !params.has('tt')) {
            return null;
        }

        // Cursor positions are encoded in the text via underlined characters
        const exercise = {
            name: params.get('n'),
            description: params.get('d') || '',
            start: params.get('st'),
            final: params.get('tt'),
            custom: true
        };

        if (params.has('c')) {
            exercise.category = params.get('c');
        }
        if (params.has('h')) {
            exercise.hint = params.get('h');
        }

        return exercise;
    } catch (e) {
        console.error('Failed to parse exercise from URL:', e);
        return null;
    }
}

// Import exercise object and add to collection
function importExercise(exercise, showAlerts = true) {
    // Validate exercise structure
    if (!exercise.name || !exercise.description || !exercise.start || !exercise.final) {
        if (showAlerts) alert('Invalid exercise format. Missing required fields.');
        return null;
    }

    // Mark as custom and imported
    exercise.custom = true;

    // Check if exercise already exists
    const existingIndex = exercises.findIndex(ex =>
        ex.name === exercise.name && ex.start === exercise.start && ex.final === exercise.final
    );

    if (existingIndex !== -1) {
        if (showAlerts && !confirm('An exercise with this name and content already exists. Import anyway?')) {
            return null;
        }
        // If it exists and we're not showing alerts (URL import), just load the existing one
        if (!showAlerts) {
            return existingIndex;
        }
    }

    // Add to custom exercises in localStorage
    const customExercises = loadCustomExercises();
    customExercises.push(exercise);
    localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(customExercises));

    // Add to exercises array and update UI
    exercises.push(exercise);

    // Return the index of the new exercise
    return exercises.length - 1;
}

// Check URL for shared exercise and auto-import
function checkUrlForSharedExercise() {
    const exercise = parseExerciseFromUrl();

    if (exercise) {
        // Import the exercise without showing alerts
        const exerciseIndex = importExercise(exercise, false);

        if (exerciseIndex !== null) {
            // Clean up URL (remove query parameters)
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);

            // Return the index to load this exercise
            return exerciseIndex;
        }
    }

    return null;
}

// Convert exercise to YAML format
// Note: Cursor positions should be encoded in start/final text using underlined characters
function exerciseToYaml(exercise) {
    let yaml = `- name: ${escapeYamlString(exercise.name)}\n`;
    yaml += `  category: ${escapeYamlString(exercise.category || 'Custom')}\n`;
    yaml += `  description: ${escapeYamlString(exercise.description)}\n`;

    if (exercise.hint) {
        yaml += `  hint: ${escapeYamlString(exercise.hint)}\n`;
    }

    // Use block scalar for multi-line, simple string otherwise
    if (exercise.start.includes('\n')) {
        yaml += `  start: |-\n${exercise.start.split('\n').map(l => '    ' + l).join('\n')}\n`;
    } else {
        yaml += `  start: ${escapeYamlString(exercise.start)}\n`;
    }

    if (exercise.final.includes('\n')) {
        yaml += `  final: |-\n${exercise.final.split('\n').map(l => '    ' + l).join('\n')}\n`;
    } else {
        yaml += `  final: ${escapeYamlString(exercise.final)}\n`;
    }

    return yaml;
}

// Escape YAML special characters in strings
function escapeYamlString(str) {
    if (!str) return "''";
    // Check if string needs quoting
    if (str.includes(':') || str.includes('#') || str.includes("'") ||
        str.includes('"') || str.startsWith(' ') || str.endsWith(' ') ||
        str.includes('\n')) {
        // Use single quotes and escape internal single quotes
        return "'" + str.replace(/'/g, "''") + "'";
    }
    return str;
}

// Export all custom exercises to YAML
function exportExercises() {
    // Get custom exercises only (not built-in)
    const customExercises = loadCustomExercises();

    if (customExercises.length === 0) {
        alert('No custom exercises to export. Create some exercises first!');
        return;
    }

    let yaml = '# Vimercise Custom Exercises\n';
    yaml += '# Import this file to add these exercises to Vimercise\n\n';

    customExercises.forEach(exercise => {
        yaml += exerciseToYaml(exercise) + '\n';
    });

    // Create and download the file
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vimercise-exercises.yaml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Import exercises from YAML file
function importExercisesFromYaml(yamlContent) {
    try {
        const importedExercises = jsyaml.load(yamlContent);

        if (!Array.isArray(importedExercises)) {
            alert('Invalid YAML format. Expected an array of exercises.');
            return;
        }

        let importedCount = 0;
        let skippedCount = 0;

        importedExercises.forEach(exercise => {
            // Validate required fields
            if (!exercise.name || !exercise.start || !exercise.final) {
                skippedCount++;
                return;
            }

            // Mark as custom
            exercise.custom = true;
            exercise.category = exercise.category || 'Imported';

            // Check if already exists
            const exists = exercises.some(ex =>
                ex.name === exercise.name &&
                ex.start === exercise.start &&
                ex.final === exercise.final
            );

            if (exists) {
                skippedCount++;
                return;
            }

            // Add to custom exercises in localStorage
            const customExercises = loadCustomExercises();
            customExercises.push(exercise);
            localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(customExercises));

            // Add to exercises array
            exercises.push(exercise);
            importedCount++;
        });

        // Update UI
        renderProgressTable();

        if (importedCount > 0) {
            alert(`Imported ${importedCount} exercise(s).${skippedCount > 0 ? ` Skipped ${skippedCount} (duplicates or invalid).` : ''}`);
        } else {
            alert('No new exercises imported. All exercises already exist or are invalid.');
        }
    } catch (e) {
        console.error('Failed to import exercises:', e);
        alert('Failed to parse YAML file. Please check the format.');
    }
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
    const container = document.getElementById('progress-table-container');
    if (!container) return; // Guard for initial load

    const progress = loadProgress();
    container.innerHTML = '';

    // Group exercises by category
    const exercisesByCategory = {};
    exercises.forEach((exercise, index) => {
        const category = exercise.category || 'Uncategorized';
        if (!exercisesByCategory[category]) {
            exercisesByCategory[category] = [];
        }
        exercisesByCategory[category].push({ exercise, index });
    });

    // Create a table for each category
    Object.keys(exercisesByCategory).sort().forEach(category => {
        // Create category section
        const categorySection = document.createElement('div');
        categorySection.className = 'category-section';

        // Create category header with toggle icon
        const categoryHeader = document.createElement('h3');
        categoryHeader.className = 'category-header collapsed';

        const headerText = document.createElement('span');
        headerText.textContent = category;

        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'category-toggle-icon';
        toggleIcon.textContent = '▶';

        categoryHeader.appendChild(toggleIcon);
        categoryHeader.appendChild(headerText);
        categorySection.appendChild(categoryHeader);

        // Create table for this category
        const table = document.createElement('table');
        table.className = 'progress-table category-table collapsed';

        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Exercise</th>
                <th>Keystrokes</th>
            </tr>
        `;
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');
        exercisesByCategory[category].forEach(({ exercise, index }) => {
            const row = document.createElement('tr');
            row.className = 'progress-row';
            if (index === currentExerciseIndex) {
                row.classList.add('active');
            }
            row.dataset.exerciseIndex = index;

            const exerciseData = progress.exercises[exercise.name];

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

            row.appendChild(nameCell);
            row.appendChild(keystrokesCell);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        categorySection.appendChild(table);
        container.appendChild(categorySection);

        // Add click handler for category toggle
        categoryHeader.addEventListener('click', () => {
            categoryHeader.classList.toggle('collapsed');
            table.classList.toggle('collapsed');
        });

        // Auto-expand category if it contains the active exercise
        const hasActiveExercise = exercisesByCategory[category].some(
            ({ index }) => index === currentExerciseIndex
        );
        if (hasActiveExercise) {
            categoryHeader.classList.remove('collapsed');
            table.classList.remove('collapsed');
        }
    });

    // Add click handlers for navigation
    container.querySelectorAll('.progress-row').forEach(row => {
        row.addEventListener('click', () => {
            const index = parseInt(row.dataset.exerciseIndex);
            currentExerciseIndex = index;
            loadExercise(currentExerciseIndex);
        });
    });
}

// Clear all progress
function clearProgress() {
    localStorage.removeItem(STORAGE_KEY);
    renderProgressTable();
}

// Compartment for controlling read-only state
const readOnlyCompartment = new Compartment();

// Get the editor wrapper elements
const editorWrappers = document.querySelectorAll('.editor-section .editor-wrapper');
const startingWrapper = editorWrappers[0];
const targetWrapper = editorWrappers[1];

// Build mapping from mathematical monospace characters to ASCII
const COMBINING_UNDERLINE = '\u0332';
const mathToAscii = new Map();

// Lowercase a-z: U+1D68A to U+1D6A3
for (let i = 0; i < 26; i++) {
    mathToAscii.set(String.fromCodePoint(0x1D68A + i), String.fromCharCode(97 + i));
}
// Uppercase A-Z: U+1D670 to U+1D689
for (let i = 0; i < 26; i++) {
    mathToAscii.set(String.fromCodePoint(0x1D670 + i), String.fromCharCode(65 + i));
}
// Digits 0-9: U+1D7F6 to U+1D7FF
for (let i = 0; i < 10; i++) {
    mathToAscii.set(String.fromCodePoint(0x1D7F6 + i), String.fromCharCode(48 + i));
}

// Parse text and extract cursor position from underlined characters
// Detects characters followed by combining underline (U+0332) and extracts cursor position
function parseUnderlinedCursor(text) {
    let cursorPos = null;
    let result = '';
    let resultPos = 0;

    // Use Array.from to properly iterate over code points (handles surrogate pairs)
    const chars = Array.from(text);

    for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const nextChar = chars[i + 1];

        if (nextChar === COMBINING_UNDERLINE) {
            // This character is underlined - it marks the cursor position
            cursorPos = resultPos;

            // Convert mathematical monospace character to ASCII if applicable
            const plainChar = mathToAscii.get(char) || char;
            result += plainChar;
            resultPos++;

            // Skip the combining underline
            i++;
        } else if (char !== COMBINING_UNDERLINE) {
            // Regular character (skip orphan combining underlines)
            result += char;
            resultPos++;
        }
    }

    return { text: result, cursorPos };
}

// Parse text and extract cursor position from underlined characters
function parseTextWithCursor(text) {
    return parseUnderlinedCursor(text);
}

// Build reverse mapping from ASCII to mathematical monospace characters
const asciiToMath = new Map();
for (const [math, ascii] of mathToAscii) {
    asciiToMath.set(ascii, math);
}

// Insert underlined cursor marker at the specified position
// Converts the character at cursorPos to its underlined equivalent
function insertUnderlinedCursor(text, cursorPos) {
    if (cursorPos < 0 || cursorPos >= text.length) {
        return text;
    }

    const chars = Array.from(text);
    const charAtPos = chars[cursorPos];

    // Convert to mathematical monospace if it's a letter or digit
    const mathChar = asciiToMath.get(charAtPos) || charAtPos;

    // Insert the character with combining underline
    chars[cursorPos] = mathChar + COMBINING_UNDERLINE;

    return chars.join('');
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

// Function to show success prompt
function showSuccessPrompt() {
    // Check if prompt already exists
    let prompt = document.getElementById('success-prompt');
    if (!prompt) {
        prompt = document.createElement('div');
        prompt.id = 'success-prompt';
        prompt.className = 'success-prompt';
        prompt.innerHTML = 'Press <strong>R</strong> to retry or <strong>Enter</strong> to advance to next exercise';
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
    const exercise = getCurrentExercise();
    const finalParsed = parseTextWithCursor(exercise.final);
    const currentText = view.state.doc.toString();
    const currentCursorPos = view.state.selection.main.head;

    const textMatches = currentText === finalParsed.text;

    // Normalize cursor position (vim normal mode can't be after last char)
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

            // Make editor read-only and blur it
            view.dispatch({
                effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(true))
            });

            // Remove focus from the editor
            view.contentDOM.blur();

            // Save progress
            updateExerciseProgress(exercise.name, keystrokeCount);

            // Show success prompt
            showSuccessPrompt();
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

            // Hide success prompt
            hideSuccessPrompt();
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
function createTargetView(targetText) {
    const parent = document.getElementById('target');
    if (targetView) {
        targetView.destroy();
    }

    // Parse to get cursor position and clean text
    const { text, cursorPos } = parseTextWithCursor(targetText);

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
    const startParsed = parseTextWithCursor(exercise.start);

    // Normalize start cursor position for vim normal mode
    let startCursorPos = startParsed.cursorPos;
    if (startCursorPos !== null && startCursorPos >= startParsed.text.length && startParsed.text.length > 0) {
        startCursorPos = startParsed.text.length - 1;
    }

    // Reset keystroke counter and success state
    keystrokeCount = 0;
    isSuccess = false;
    updateKeystrokeCount();

    // Remove success state from both wrappers
    startingWrapper.classList.remove('success');
    targetWrapper.classList.remove('success');

    // Hide success prompt
    hideSuccessPrompt();

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

    // Update shareable URL
    const shareUrlInput = document.getElementById('share-url-input');
    if (shareUrlInput) {
        const shareUrl = buildShareUrl(exercise);
        shareUrlInput.value = shareUrl || '';
    }

    // Create editors - final view highlights the cursor position
    createEditor(startParsed.text, startCursorPos);
    createTargetView(exercise.final);

    // Set up event listener for vim mode updates
    editorView.dom.addEventListener('keyup', updateVimMode);

    // Focus the editor
    editorView.focus();
    updateVimMode();

    // Update sidebar active state
    renderProgressTable();
}

// Function to advance to next exercise
function advanceToNextExercise() {
    if (currentExerciseIndex < exercises.length - 1) {
        currentExerciseIndex++;
        loadExercise(currentExerciseIndex);
    } else {
        // If at last exercise, show a message
        alert('You\'re at the last exercise');
    }
}

// Function to retry current exercise
function retryCurrentExercise() {
    loadExercise(currentExerciseIndex);
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

// Get text and cursor position from editor
// Returns { text, cursorPos } object
function getTextAndCursor(view, recordCursor) {
    if (!view) return { text: '', cursorPos: null };

    const text = view.state.doc.toString();
    if (!recordCursor) {
        return { text, cursorPos: null };
    }

    const cursorPos = view.state.selection.main.head;
    return { text, cursorPos };
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

    // Get text and cursor positions from editors
    const startingData = getTextAndCursor(startingEditorView, recordStartingCursor);
    const targetData = getTextAndCursor(goalEditorView, recordGoalCursor);

    // Validate that there's some content
    if (!startingData.text.trim() && !targetData.text.trim()) {
        alert('Please enter some text in at least one of the editors.');
        return;
    }

    // Convert cursor positions to underlined characters if recorded
    let startText = startingData.text;
    let finalText = targetData.text;

    if (startingData.cursorPos !== null) {
        startText = insertUnderlinedCursor(startText, startingData.cursorPos);
    }
    if (targetData.cursorPos !== null) {
        finalText = insertUnderlinedCursor(finalText, targetData.cursorPos);
    }

    const exercise = {
        name,
        start: startText,
        final: finalText,
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
        // Load exercises from YAML file
        const response = await fetch('exercises.yaml');
        if (!response.ok) {
            throw new Error(`Failed to load exercises: ${response.statusText}`);
        }
        const yamlText = await response.text();
        const builtInExercises = jsyaml.load(yamlText);

        // Load custom exercises and merge with built-in exercises
        const customExercises = loadCustomExercises();
        exercises = [...builtInExercises, ...customExercises];

        // Check if there's a shared exercise in the URL
        const sharedExerciseIndex = checkUrlForSharedExercise();

        // Reset button functionality
        document.getElementById('reset-btn').addEventListener('click', () => {
            loadExercise(currentExerciseIndex);
        });

        // Initial load - use shared exercise if available, otherwise start at 0
        const initialIndex = sharedExerciseIndex !== null ? sharedExerciseIndex : 0;
        currentExerciseIndex = initialIndex;
        loadExercise(initialIndex);

        // Initialize progress sidebar
        renderProgressTable();

        // Clear progress button handler
        document.getElementById('clear-progress-btn').addEventListener('click', clearProgress);

        // Create exercise button handler
        document.getElementById('create-exercise-btn').addEventListener('click', () => {
            toggleCreateSection(true);
        });

        // Export exercises button handler
        document.getElementById('export-exercises-btn').addEventListener('click', exportExercises);

        // Import exercises button handler
        const importFileInput = document.getElementById('import-file-input');
        document.getElementById('import-exercises-btn').addEventListener('click', () => {
            importFileInput.click();
        });
        importFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    importExercisesFromYaml(e.target.result);
                    // Reset the input so the same file can be imported again
                    importFileInput.value = '';
                };
                reader.readAsText(file);
            }
        });

        // Copy URL button handler
        document.getElementById('copy-url-btn').addEventListener('click', () => {
            const urlInput = document.getElementById('share-url-input');
            if (urlInput && urlInput.value) {
                navigator.clipboard.writeText(urlInput.value).then(() => {
                    // Successfully copied - no alert
                }).catch(err => {
                    console.error('Failed to copy:', err);
                    // Fallback: select the text
                    urlInput.select();
                });
            }
        });

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

        // Global keyboard handler for success state navigation
        document.addEventListener('keydown', (event) => {
            // Only handle these keys when success is achieved
            if (!isSuccess) return;

            if (event.key === 'r' || event.key === 'R') {
                event.preventDefault();
                retryCurrentExercise();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                advanceToNextExercise();
            }
        });
    } catch (error) {
        console.error('Error initializing Vimercise:', error);
        alert('Failed to load exercises. Please make sure exercises.yaml is available.');
    }
}

// Start the application
init();
