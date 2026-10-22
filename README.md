# Song Notebook

A phone-first songwriter's notebook for people who make music with Suno.

- **Songs:** title, status (Idea, Writing, Generating, Keeper, Released), style prompt, exclude styles, notes.
- **Lyrics:** one-tap structure tags such as `[Verse]` and `[Chorus]`, character counts, copy to clipboard.
- **Takes:** save links to the generations worth keeping, label and rate them.
- **Release checklist:** the steps from final take to sharing the release.
- **Style library:** reuse the style prompts that worked.
- **Backup:** export and import everything as a JSON file.

It is a static web app (plain HTML, CSS and JavaScript, no build step). Data stays in the browser's local storage on the device. It installs to the home screen and works offline.

Song Notebook is an independent tool and is not affiliated with Suno.

## Deploying

Pushing to `main` deploys to GitHub Pages through `.github/workflows/pages.yml`. In the repository settings, set Pages to deploy from GitHub Actions.

When you ship changes, bump `CACHE` in `sw.js` so installed copies pick up the new files.
