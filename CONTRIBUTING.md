# Contributing to CharlestonHacks

We welcome contributions! This guide covers the workflow, automation, and conventions for this repo.

## Getting Started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Commit with a clear message (`git commit -m 'Add feature X'`)
5. Push to your branch (`git push origin feature/your-feature`)
6. Open a Pull Request against `main`

## Pull Request Workflow

### Automated Code Review

When you open or update a PR, a **Claude Code Review** workflow runs automatically. It reviews your changes for:

- Code quality and best practices
- Potential bugs or issues
- Performance considerations
- Security concerns

The review posts as a comment on your PR. This requires repository secrets (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`) to be configured by a maintainer.

### Deployment

This is a GitHub Pages site. Merging to `main` triggers an automatic deployment — changes go live within 1-2 minutes.

## Code Conventions

### HTML

- Use `lang="en-US"` on all public-facing pages
- Include proper meta tags: `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`
- Use absolute URLs for meta tags (og, canonical, twitter) and relative paths for in-page links
- Use semantic HTML and ARIA labels for accessibility
- Follow the existing nav structure (Home, About, Member Portal, Next Event)

### CSS

- Use CSS custom properties defined in `:root` (see `index.html` or `styles.css`)
- Mobile-first responsive design with `768px` breakpoint
- Prefer existing utility classes over inline styles

### JavaScript

- ES6+ modules (`type="module"`)
- Follow existing naming conventions
- Add comments for complex logic
- Supabase client is shared via `/assets/js/supabaseClient.js`

## Project Structure

```
├── index.html              # Landing page (public-facing, SEO-optimized)
├── hub.html                # Member Portal (interactive card-based UI)
├── dashboard.html          # Innovation Engine (network visualization app)
├── about.html              # About page
├── community.html          # Community page with actions/channels
├── subscribe.html          # Newsletter signup
├── donations.html          # Support/donate page
├── bbs.html                # Community BBS chat
├── assets/
│   ├── css/                # Stylesheets
│   ├── js/                 # JavaScript modules
│   └── data/               # Static data (events.json, etc.)
├── .github/workflows/      # CI/CD automation
└── docs/                   # Internal documentation
```

## Key Pages

| Page | Purpose | Audience |
|------|---------|----------|
| `index.html` | Landing page, event info, conversion funnel | New visitors |
| `hub.html` | Interactive portal with 9 feature areas | Members |
| `dashboard.html` | Innovation Engine (network viz, profiles) | Logged-in members |
| `community.html` | Get involved, channels, actions | Anyone |

## Running Locally

This is a static site — no build step required. Open any HTML file in a browser, or use a local server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Some features (Supabase auth, API calls) require the site to be served from `localhost` or the production domain.

## Questions?

- **Email:** hello@charlestonhacks.com
- **Issues:** [GitHub Issues](https://github.com/Charlestonhacks/charlestonhacks.github.io/issues)
