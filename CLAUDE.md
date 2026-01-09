# Vimercise

## Project Overview

Vimercise is a browser-based interactive learning tool designed to help users practice and master Vim keyboard commands and motions. The project provides a hands-on, exercise-driven approach to learning Vim without requiring a full Vim installation or terminal environment.

## Goals

### Primary Goals

1. **Interactive Vim Practice**: Provide a safe, accessible environment for users to practice Vim commands in their browser
2. **Visual Feedback**: Show users exactly what they need to achieve with clear visual indicators for cursor position and success states
3. **Progressive Learning**: Support multiple exercises of varying difficulty to build skills incrementally
4. **Keyboard-Only Navigation**: Enforce vim-style keyboard navigation by disabling mouse cursor movement
5. **Performance Tracking**: Track keystrokes to help users measure efficiency and improve their command knowledge

### Secondary Goals

1. **Motion Practice**: Allow exercises to focus on cursor movement/positioning as well as text editing
2. **Immediate Validation**: Provide instant feedback when exercises are completed correctly
3. **Simplicity**: Static files only (HTML, CSS, JSON) - no build process, no frameworks, easy deployment

## How It Works

### Exercise Structure

Each exercise consists of:
- **Starting Text**: The initial state of the text editor, including starting cursor position
- **Target Text**: The desired end state, including target cursor position
- **Name & Description**: Brief explanation of what the exercise teaches

### Cursor Position Markers

The `|` character is used to mark cursor positions in exercise definitions:
- `"Hello |World"` - cursor should be on the 'W'
- `"Hello World|"` - cursor should be on the 'd' (last character)

In the Target view, the character at the cursor position is highlighted with a blue box outline to show users exactly where their cursor needs to be.

### Success Criteria

An exercise is considered complete when ALL of the following conditions are met:
1. The text content matches the target exactly
2. The cursor position matches the target position
3. The user is in Vim NORMAL mode (not insert, visual, or replace mode)

When success is achieved:
- Both editor boxes turn green
- The starting text editor becomes completely non-interactive
- Users must navigate to the next exercise or reset to continue

## Key Features

### 1. Mouse Movement Disabled
Mouse clicks cannot move the cursor in the editable area, forcing users to rely on Vim keyboard commands for navigation.

### 2. Keystroke Counter
Tracks the number of keystrokes used during each exercise, helping users identify more efficient command sequences.

### 3. Multiple Exercises
Users can navigate between different exercises using Previous/Next buttons, with progress indicators showing current position.

### 4. Vim Mode Indicator
Real-time display of the current Vim mode (Normal, Insert, Visual, Replace) to help users understand their current state.

### 5. Visual Success Feedback
Clear visual feedback with green highlighting when exercises are completed successfully.

### 6. Full Vim Emulation
Uses CodeMirror 6 with the @replit/codemirror-vim extension to provide authentic Vim keybindings and behavior.

## Technical Implementation

### Technology Stack
- **CodeMirror 6**: Modern code editor framework
- **@replit/codemirror-vim**: Vim keybinding emulation
- **Vanilla JavaScript**: No additional frameworks required
- **Static Files**: HTML, CSS, and JSON - no build process needed

### File Structure
- `index.html` - Main application file with all JavaScript logic
- `styles.css` - All styling rules
- `exercises.json` - Exercise definitions (loaded via fetch)

### Architecture Highlights

1. **Dual Editor Setup**: Side-by-side editors showing starting text (editable) and target text (read-only)
2. **Cursor Position Highlighting**: Custom CodeMirror decorations to highlight target cursor positions
3. **Dynamic Read-Only State**: Uses CodeMirror Compartments to toggle editor interactivity on success
4. **Event Blocking**: Comprehensive keyboard and mouse event handling to enforce constraints
5. **Async Exercise Loading**: Exercises are fetched from JSON file at startup

### Local Development

**Important**: Due to browser CORS restrictions, you cannot open `index.html` directly with the `file://` protocol. You must run a local web server.

**Quick start options:**

```bash
# Python 3
python3 -m http.server 8000
# Then open http://localhost:8000

# Node.js
npx serve
# Then open the URL shown

# PHP
php -S localhost:8000
```

**VS Code users**: Install the "Live Server" extension and right-click `index.html` → "Open with Live Server"

### Deployment

The site works perfectly on static hosting platforms without any configuration:
- **GitHub Pages**: Just push and enable GitHub Pages in repository settings
- **Netlify**: Drag and drop the folder or connect to repository
- **Vercel**: Connect to repository for automatic deployments
- **Any static web server**: Upload files and serve

## Adding New Exercises

Exercises are defined in `exercises.json`. To add a new exercise, add an object to the JSON array:

```json
{
    "name": "Exercise Name",
    "starting": "Initial text with |cursor position",
    "target": "Final text with |cursor position",
    "description": "Brief description of what to do"
}
```

### Example Exercise

```json
{
    "name": "Delete a word",
    "starting": "|The quick brown lazy fox",
    "target": "The quick brown fox|",
    "description": "Delete the word 'lazy'"
}
```

This exercise teaches the user to:
1. Navigate to the word "lazy" (using `3w` or similar)
2. Delete it (using `dw` or `daw`)
3. Return cursor to the end (using `$`)

### Tips for Creating Exercises

- Use the `|` character to mark cursor positions in both starting and target text
- If no `|` is specified, the cursor defaults to position 0 (start of text)
- The cursor marker in the target text shows as a blue highlighted character
- Keep exercises focused on one or two concepts
- Progress from simple to complex movements

## Future Enhancements

Potential areas for expansion:
- Hints or command suggestions for each exercise
- Timer/scoring system for speed challenges
- Multi-line exercises for more complex editing scenarios
- Exercise categories (basic motions, text objects, advanced commands)
- User-created exercise sharing
- Progress tracking across sessions
