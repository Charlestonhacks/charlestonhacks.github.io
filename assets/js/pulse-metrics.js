/**
 * pulse-metrics.js
 * Fetches live Supabase counts and populates the "Network at a Glance"
 * pulse section on the home page.
 *
 * Cards are matched by their label text so the order in the HTML doesn't matter.
 * Metric mapping:
 *   Members        → community table (visible rows)
 *   Active Projects → projects table where status = 'active'
 *   Connections    → connections table (row count)
 *   Events This Year → /assets/data/events.json filtered to current calendar year
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://mqbsjlgnsirqsmfnreqd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hKGoZiLtCe6BxgQjG23h2Q_hbGC-At3';

/** Animate a single .pulse-value element from its current displayed number to `target`. */
function animateTo(el, target) {
  if (!el || !Number.isFinite(target) || target < 0) return;
  delete el.dataset.counted; // reset so the existing observer doesn't skip it
  el.dataset.counted = 'true';
  const from = parseInt(el.textContent.replace(/,/g, ''), 10) || 0;
  const duration = 1500;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + eased * (target - from)).toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/** Update a card's data-target and, if the section is already in view, animate immediately. */
function updateCard(label, value, sectionInView) {
  const card = [...document.querySelectorAll('.pulse-card')].find(c => {
    const lbl = c.querySelector('.pulse-label');
    return lbl && lbl.textContent.trim().toLowerCase() === label.toLowerCase();
  });
  if (!card) return;

  const el = card.querySelector('.pulse-value');
  if (!el) return;

  el.dataset.target = value;

  if (sectionInView) {
    animateTo(el, value);
  } else {
    // Reset so the IntersectionObserver-triggered animateCounters() picks up the new target
    delete el.dataset.counted;
    el.textContent = '0';
  }
}

async function loadPulseMetrics() {
  try {
    // Reuse the existing singleton if hub.js / portal.js already initialised it
    const supabase = window.supabase || createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const currentYear = new Date().getFullYear();

    const [membersRes, projectsRes, connectionsRes, eventsResp] = await Promise.all([
      supabase
        .from('community')
        .select('id', { count: 'exact', head: true })
        .or('is_hidden.is.null,is_hidden.eq.false'),

      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),

      supabase
        .from('connections')
        .select('id', { count: 'exact', head: true }),

      fetch('/assets/data/events.json').then(r => r.ok ? r.json() : { events: [] }).catch(() => ({ events: [] })),
    ]);

    const eventsThisYear = (eventsResp.events || []).filter(e => {
      try { return new Date(e.startDate).getFullYear() === currentYear; } catch { return false; }
    }).length;

    // Determine if the pulse section is already scrolled into view
    const pulseSection = document.getElementById('pulse-section');
    const inView = pulseSection
      ? pulseSection.getBoundingClientRect().top < window.innerHeight * 0.9
      : false;

    if (membersRes.count !== null)     updateCard('Members',           membersRes.count,     inView);
    if (projectsRes.count !== null)    updateCard('Active Projects',   projectsRes.count,    inView);
    if (connectionsRes.count !== null) updateCard('Connections',       connectionsRes.count, inView);
    if (eventsThisYear > 0)            updateCard('Events This Year',  eventsThisYear,       inView);

    console.log('[pulse] Live metrics loaded:', {
      members: membersRes.count,
      activeProjects: projectsRes.count,
      connections: connectionsRes.count,
      eventsThisYear,
    });
  } catch (err) {
    // Non-fatal — hardcoded fallback values remain visible
    console.warn('[pulse] Could not load live metrics, using fallback values:', err);
  }
}

// Kick off as soon as the module is executed (non-blocking)
loadPulseMetrics();
