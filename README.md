Audio Signal Processor - Professional (Ready for Vercel)
===========================================================

What's included:
- index.html (uses Tone.js CDN)
- style.css
- app.js (handles loading, playback, pitch shift via Tone.PitchShift, filter, waveform, export)

How to deploy to GitHub + Vercel (quick):
1. Create a new GitHub repository (public/private).
2. Copy these files into the repo root.
3. Push to GitHub.
4. Go to https://vercel.com, sign in, create a new project, import from GitHub, select the repo.
5. Vercel will detect a static site and deploy automatically. The default build command is not needed for static sites.

Notes:
- True high-quality pitch-shifting without speed change can require extra libraries or AudioWorklet implementations.
- Tone.js PitchShift provides reasonable results for many use cases.
