# UI testbenches

These browser previews import the same page components and styles used by the app. They run without a Telegram connection; the Planner testbench disables real sending and scheduling.

From the `XMSGi Studio` project directory, start Vite:

```powershell
npm run dev -- --port 5174
```

Use the dedicated port so the preview keeps its browser storage separate from the app's development origin.
Testbench pages also save their theme under a testbench-only preference, so changing a preview theme does not change the app's theme.
Control bars stay on one line; on narrow screens, scroll them horizontally to reach the remaining controls.

Open the testbench hub at `http://127.0.0.1:5174/testbenches/`, or open a page directly:

- Login: `/testbenches/login/`
- Studio editor: `/testbenches/studio-editor/`
- Planner: `/testbenches/planner/`
- Settings: `/testbenches/settings/`
