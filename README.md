# Orbit AI Chat Assistant

A full-stack, responsive AI chat application with separate frontend and backend folders.

## Included features

- Multi-conversation chat history saved in the browser
- Image attachment, thumbnail preview, removal, and image-aware API payloads
- One-click navigation to the beginning or latest message
- Conversation search, export, retry, copy, dark mode, responsive sidebar, and keyboard shortcuts
- API backend with a graceful demo fallback; configure an OpenAI-compatible provider when ready

## Run it

1. Open a terminal in this folder.
2. Optionally copy `.env.example` to `.env` and add `OPENAI_API_KEY`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

The application runs without configuration in demo mode. To enable real responses, make sure your Node environment loads `.env` values (or set them in the terminal before running) and set the listed provider variables.
