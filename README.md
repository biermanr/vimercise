# Vimercise

Practice and master Vim commands in your browser through interactive exercises.

## Live Demo

**[Try it now →](https://biermanr.github.io/vimercise/)**

## What is Vimercise?

Vimercise is a browser-based learning tool that helps you practice Vim keyboard commands through hands-on exercises. Transform starting text into target text using only Vim commands - no mouse cursor movement allowed!

## Features

- **Interactive Vim Editor**: Full Vim keybindings powered by CodeMirror
- **Visual Cursor Targets**: See exactly where your cursor should end up
- **Instant Feedback**: Both text and cursor position must match to succeed
- **Keystroke Tracking**: Monitor your efficiency with each exercise
- **Multiple Exercises**: Practice different commands from basic to advanced
- **Normal Mode Required**: Success only counts when you're back in normal mode

## Local Development

Run a local web server (required for loading exercises):

```bash
# Python 3
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Adding Exercises

Edit `exercises.json` to add new exercises. Use `|` to mark cursor positions:

```json
{
    "name": "Your Exercise",
    "starting": "|Starting text",
    "target": "Target |text",
    "description": "What to practice"
}
```

## Contributing

Contributions welcome! Feel free to:
- Add new exercises
- Improve existing exercises
- Report bugs or suggest features
- Submit pull requests

## AI Usage Disclaimer

This was created largely with Claude Code.

## License

MIT
