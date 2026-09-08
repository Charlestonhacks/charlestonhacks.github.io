(function () {
  const cfg = window.HARBORHACK_2026_CONFIG;
  const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
  const has = value => value !== undefined && value !== null && String(value).trim() !== '';
  function safeLink(element, url) { if (!has(url)) { element.hidden = true; return; } element.href = url; if (/^https?:/i.test(url)) { element.target = '_blank'; element.rel = 'noopener noreferrer'; } }
  function initContent() {
    $$('[data-fill]').forEach(element => { const value = cfg[element.dataset.fill]; if (has(value)) element.textContent = value; else element.closest('.hh-card, details')?.setAttribute('hidden', ''); });
    $$('[data-config-link]').forEach(element => safeLink(element, cfg[element.dataset.configLink]));
    $$('[data-registration-link]').forEach(element => safeLink(element, cfg.registrationUrl));
  }
  function pad(number) { return String(number).padStart(2, '0'); }
  function icsDate(value) { const date = new Date(value); return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) + 'T' + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z'; }
  function eventDescription() { return [cfg.eventName, '', 'Theme:', cfg.theme, '', 'A weekend hackathon where every team builds a project with an AI agent as a teammate.', '', 'Website:', 'https://charlestonhacks.com/harborhack-2026'].join('\n'); }
  function calendarData() { return { title: cfg.eventName, location: cfg.calendarLocation, description: eventDescription(), start: cfg.eventStartDate, end: cfg.eventEndDate }; }
  function ics() { const event = calendarData(), escape = value => String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CharlestonHacks//HarborHack 2026//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:harborhack-2026@charlestonhacks.com', 'DTSTAMP:' + icsDate(new Date().toISOString()), 'DTSTART:' + icsDate(event.start), 'DTEND:' + icsDate(event.end), 'SUMMARY:' + escape(event.title), 'LOCATION:' + escape(event.location), 'DESCRIPTION:' + escape(event.description), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'); }
  function initCalendar() {
    const google = $('#calendar-google'); if (!google) return;
    const event = calendarData(), query = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: icsDate(event.start) + '/' + icsDate(event.end), details: event.description, location: event.location });
    safeLink(google, 'https://calendar.google.com/calendar/render?' + query.toString());
    const download = () => { const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([ics()], { type: 'text/calendar' })); anchor.download = 'harborhack-2026.ics'; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); };
    ['#calendar-ics', '#calendar-apple', '#calendar-outlook'].forEach(id => $(id)?.addEventListener('click', download));
  }
  function initSchedule() {
    const root = $('#schedule-list'), filters = $('#schedule-filters'); if (!root || !filters) return;
    const schedule = Array.isArray(cfg.schedule) ? cfg.schedule.filter(item => has(item.title)) : [];
    if (!schedule.length) { root.innerHTML = '<div class="empty">Schedule details are still being finalized.</div>'; filters.hidden = true; return; }
    const categories = ['All', ...new Set(schedule.map(item => item.category).filter(has))]; if (categories.length < 3) filters.hidden = true;
    function render(category = 'All') {
      root.innerHTML = ''; const items = schedule.filter(item => category === 'All' || item.category === category), byDay = {};
      items.forEach(item => { const key = `${item.day || 'Event'}|${item.date || ''}`; (byDay[key] ||= []).push(item); });
      Object.entries(byDay).forEach(([key, dayItems]) => {
        const [day, date] = key.split('|'), group = document.createElement('div'), heading = document.createElement('h3'); group.className = 'schedule-day'; heading.textContent = day;
        if (has(date)) { const dateLabel = document.createElement('span'); dateLabel.textContent = date; heading.append(dateLabel); } group.append(heading);
        dayItems.forEach(item => {
          const card = document.createElement('article'); card.className = 'hh-card';
          if (has(item.category) || has(item.startTime)) { const meta = document.createElement('p'); meta.className = 'eyebrow'; meta.textContent = [item.category, item.startTime].filter(has).join(' · '); card.append(meta); }
          const title = document.createElement('h4'); title.textContent = item.title; card.append(title);
          [item.description, item.location].filter(has).forEach(value => { const paragraph = document.createElement('p'); paragraph.textContent = value; card.append(paragraph); }); group.append(card);
        }); root.append(group);
      });
    }
    categories.forEach(category => { const button = document.createElement('button'); button.type = 'button'; button.textContent = category; button.addEventListener('click', () => render(category)); filters.append(button); }); render();
  }
  document.addEventListener('DOMContentLoaded', () => { initContent(); initCalendar(); initSchedule(); });
})();
