# WindDesk submission checklist

## Local project

- [x] React and Flask implementation
- [x] Real Elexon snapshot and source metadata
- [x] Docker, Vercel configuration, and GitHub Actions workflow
- [x] README with setup and AI-use disclosure
- [x] Backend test suite (25 tests), frontend type check, and production build
- [x] Idempotent snapshot replay verified without changing file modification times
- [x] Recompute one real delivery day independently; API MAE and bias match

## Release steps

- [ ] Initialize or select the public GitHub repository with an anonymous repository name
- [ ] Review Git author name and email before publishing history
- [ ] Push the project and confirm the GitHub Actions workflow is green
- [ ] Deploy to Vercel or run the Docker image on the selected host
- [ ] Open the deployed app and API in a fresh browser profile
- [ ] Record and upload the two-part demo as an unlisted video, under ten minutes
- [ ] Add the repository, deployed app, and video links to the submission form
- [ ] Open each submitted URL without signing in

The current workspace has no Git repository, GitHub connection, Vercel connection, or deployment URL. Complete the release steps after those accounts and connections are available.
