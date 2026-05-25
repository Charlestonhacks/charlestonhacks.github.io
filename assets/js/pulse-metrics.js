/**
 * pulse-metrics.js
 * Fetches live Supabase counts and populates the "Network at a Glance"
 * pulse section on the home page.
 *
 * Counts come from a SECURITY DEFINER RPC function (get_pulse_metrics)
 * that safely bypasses RLS for aggregate-only data.  If the RPC is
 * unavailable the module falls back to the hardcoded data-target values
 * already in the HTML.
 *
 * SQL to deploy the RPC:
 *   supabase/sql/functions/get_pulse_metrics.sql
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = 'https://mqbsjlgnsirqsmfnreqd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hKGoZiLtCe6BxgQjG23h2Q_hbGC-At3';

/** Animate a single .pulse-value element to a new target. */
function animateTo(el, target) {
  if (!el || !Number.isFinite(target) || target < 0) return;
  el.dataset.counted = 'true';
  const from     = parseInt(el.textContent.replace(/,/g, ''), 10) || 0;
  const duration = 1500;
  const start    = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + eased * (target - from)).toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/**
 * Update a card's data-target and animate if already in view,
 * or reset to 0 so the IntersectionObserver triggers the animation
 * naturally when the user scrolls down.
 */
function updateCard(labelText, value, sectionInView) {
  const card = [...document.querySelectorAll('.pulse-card')].find(c => {
    const lbl = c.querySelector('.pulse-label');
    return lbl && lbl.textContent.trim().toLowerCase() === labelText.toLowerCase();
  });
  if (!card) return;

  const el = card.querySelector('.pulse-value');
  if (!el) return;

  el.dataset.target = value;

  if (sectionInView) {
    animateTo(el, value);
  } else {
    // Reset so animateCounters() (IntersectionObserver) picks up the new target
    delete el.dataset.counted;
    el.textContent = '0';
  }
}

async function loadPulseMetrics() {
  try {
    // Re-use the singleton created by hub.js / portal.js when available
    const supabase = window.supabase || createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ── Fetch DB counts via SECURITY DEFINER RPC ──────────────────────────
    // get_pulse_metrics() bypasses RLS so anonymous visitors get real counts.
    const { data: metrics, error: rpcError } = await supabase.rpc('get_pulse_metrics');

    if (rpcError) {
      // RPC not deployed yet — log and keep hardcoded fallback values
      console.warn('[pulse] get_pulse_metrics RPC unavailable:', rpcError.message,
        '\nDeploy supabase/sql/functions/get_pulse_metrics.sql to enable live counts.');
      return;
    }

    // ── Events this year from local JSON ─────────────────────────────────
    const currentYear = new Date().getFullYear();
    let eventsThisYear = 0;
    try {
      const resp = await fetch('/assets/data/events.json');
      if (resp.ok) {
        const json = await resp.json();
        eventsThisYear = (json.events || []).filter(e => {
          try { return new Date(e.startDate).getFullYear() === currentYear; }
          catch { return false; }
        }).length;
      }
    } catch {
      // Non-fatal — events count stays 0; hardcoded fallback remains
    }

    // ── Determine whether the pulse section is already scrolled into view ──
    const pulseSection = document.getElementById('pulse-section');
    const inView = pulseSection
      ? pulseSection.getBoundingClientRect().top < window.innerHeight * 0.9
      : false;

    // ── Push live values to the cards ────────────────────────────────────
    // Only update a card when we have a valid (non-null) value from the DB.
    // Events fall back to the hardcoded value when the JSON has no entries
    // for the current year (eventsThisYear === 0 simply means "none found").
    if (metrics.members         != null) updateCard('Members',          metrics.members,         inView);
    if (metrics.active_projects != null) updateCard('Active Projects',  metrics.active_projects, inView);
    if (metrics.connections     != null) updateCard('Connections',      metrics.connections,     inView);
    // Always update Events — show the real count (even if 0)
    updateCard('Events This Year', eventsThisYear, inView);

    console.log('[pulse] Live metrics loaded:', {
      members:        metrics.members,
      activeProjects: metrics.active_projects,
      connections:    metrics.connections,
      eventsThisYear,
    });
  } catch (err) {
    // Non-fatal — hardcoded fallback data-target values remain in the HTML
    console.warn('[pulse] Could not load live metrics, using fallback values:', err);
  }
}

// Kick off immediately (non-blocking — won't delay page render)
loadPulseMetrics();
