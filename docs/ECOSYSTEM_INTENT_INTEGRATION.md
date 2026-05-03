# Ecosystem Intent Integration

## Overview

CharlestonHacks, Innovation Engine, and Nearify form a coordination loop.
When a user selects an intent on CharlestonHacks ("Build something", "Meet people",
"Explore ideas"), that intent is passed via `?intent=` query parameter to the
downstream apps and stored in `localStorage` as `charlestonhacks_intent`.

---

## Phase 4 — Innovation Engine (`innovation-engine`)

Add this snippet near the top of your main JS file (or in a `<script>` tag
before the closing `</body>`).

```js
/**
 * CharlestonHacks Intent Integration
 * Reads ?intent= from URL, stores in localStorage, adjusts initial UI copy.
 */
(function () {
  var STORAGE_KEY = 'charlestonhacks_intent';
  var VALID = ['build', 'meet', 'explore'];

  // Read from URL
  var params = new URLSearchParams(window.location.search);
  var intent = params.get('intent');

  // Validate and store
  if (intent && VALID.indexOf(intent) !== -1) {
    try { localStorage.setItem(STORAGE_KEY, intent); } catch (e) {}
  } else {
    // Fall back to stored intent
    try { intent = localStorage.getItem(STORAGE_KEY); } catch (e) { intent = null; }
  }

  if (!intent || VALID.indexOf(intent) === -1) return;

  // Clean URL (remove intent param without reload)
  if (params.has('intent')) {
    params.delete('intent');
    var clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', clean);
  }

  // Apply intent-specific adjustments
  var banner = {
    build: {
      headline: 'Find Collaborators & Projects',
      sub: 'Explore active builders, open projects, and hack night teams across Charleston.'
    },
    meet: {
      headline: 'Discover People Near You',
      sub: 'See who shares your interests, what events they attend, and where clusters are forming.'
    },
    explore: {
      headline: 'Browse Ideas & Experiments',
      sub: 'Discover demos, open-source projects, and experimental builds from the community.'
    }
  };

  var b = banner[intent];
  if (!b) return;

  // Example: update a welcome banner or hero text if it exists
  // Adjust these selectors to match your actual DOM
  var headlineEl = document.querySelector('.welcome-headline, .hero-title, h1');
  var subEl = document.querySelector('.welcome-sub, .hero-subtitle, .hero-desc');

  if (headlineEl && headlineEl.closest('header, .hero, .welcome')) {
    headlineEl.textContent = b.headline;
  }
  if (subEl && subEl.closest('header, .hero, .welcome')) {
    subEl.textContent = b.sub;
  }

  // Store intent as data attribute on body for CSS-based adjustments
  document.body.dataset.intent = intent;
})();
```

### CSS hooks (optional)

```css
/* Highlight specific tabs or sections based on intent */
body[data-intent="build"] .projects-tab { border-color: #00e0ff; }
body[data-intent="meet"] .people-tab { border-color: #00e0ff; }
body[data-intent="explore"] .experiments-tab { border-color: #00e0ff; }
```

---

## Phase 5 — Nearify (`nearify.org`)

Add this snippet near the top of your main JS file (or in a `<script>` tag
before the closing `</body>`).

```js
/**
 * CharlestonHacks Intent Integration for Nearify
 * Reads ?intent= from URL, stores locally, adjusts landing emphasis.
 */
(function () {
  var STORAGE_KEY = 'charlestonhacks_intent';
  var VALID = ['build', 'meet', 'explore'];

  var params = new URLSearchParams(window.location.search);
  var intent = params.get('intent');

  if (intent && VALID.indexOf(intent) !== -1) {
    try { localStorage.setItem(STORAGE_KEY, intent); } catch (e) {}
  } else {
    try { intent = localStorage.getItem(STORAGE_KEY); } catch (e) { intent = null; }
  }

  if (!intent || VALID.indexOf(intent) === -1) return;

  // Clean URL
  if (params.has('intent')) {
    params.delete('intent');
    var clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', clean);
  }

  // Intent-specific CTA emphasis
  var emphasis = {
    meet: {
      headline: 'Find Your People at the Next Event',
      sub: 'See who\'s attending, check in, and build connections that compound over time.'
    },
    build: {
      headline: 'Find Collaborators at Events',
      sub: 'The best build partners show up in person. See who\'s going and what they\'re working on.'
    },
    explore: {
      headline: 'Discover Events & People Nearby',
      sub: 'Browse upcoming events, see who\'s active, and find your entry point into the community.'
    }
  };

  var e = emphasis[intent];
  if (!e) return;

  // Adjust these selectors to match Nearify's actual DOM
  var headlineEl = document.querySelector('.landing-headline, .hero h1, h1');
  var subEl = document.querySelector('.landing-sub, .hero p, .hero-desc');

  if (headlineEl) headlineEl.textContent = e.headline;
  if (subEl) subEl.textContent = e.sub;

  document.body.dataset.intent = intent;
})();
```

---

## Phase 6 — Future Data Model (Additive Only)

When ready, these additive migrations can support richer intent routing.
**Do not run these until the UI layer is stable.**

```sql
-- Intent tracking on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS intent_primary TEXT;

-- Skills and interests for matching
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skills TEXT[];

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS interests TEXT[];

-- Event cluster tags for targeted recommendations
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cluster_tags TEXT[];

-- Per-attendance intent (what someone hopes to get from this event)
ALTER TABLE event_attendees
  ADD COLUMN IF NOT EXISTS intent_at_event TEXT;

-- Future: connection recommendations table
CREATE TABLE IF NOT EXISTS connection_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  recommended_user_id UUID REFERENCES profiles(id),
  reason TEXT,
  score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  dismissed BOOLEAN DEFAULT false
);

-- RLS: users can only see their own recommendations
ALTER TABLE connection_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users see own recommendations"
  ON connection_recommendations
  FOR SELECT
  USING (auth.uid() = user_id);
```

---

## File-by-file summary

| File | Repo | Changes |
|------|------|---------|
| `index.html` | charlestonhacks.github.io | Phase 1: Bridge section after events. Phase 2: Intent selector in hero. Phase 3: Context-aware handoff links via JS. |
| Main JS file | innovation-engine | Phase 4: Read `?intent=`, store in localStorage, adjust initial copy. |
| Main JS file | nearify.org | Phase 5: Read `?intent=`, store in localStorage, adjust landing emphasis. |
| Supabase migration | (future) | Phase 6: Additive columns and tables for intent, skills, matching. |
