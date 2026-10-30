// ===============================================
// CharlestonHacks Chat Bubble – lazy, click-safe
// ===============================================
// - No WidgetBot loaded until user clicks the bubble
// - All WidgetBot containers have pointer-events: none
//   unless the crate is open (prevents blocking clicks)
// - Draggable, position persisted, no duplicates
// ===============================================

export function setupChatBubble() {
  // Prevent duplicates
  document.querySelectorAll('#discord-bubble').forEach((b, i) => i > 0 && b.remove());
  if (window.CH_BUBBLE_INITIALIZED && document.getElementById('discord-bubble')) return;
  window.CH_BUBBLE_INITIALIZED = true;

  // Inject styles (bubble + widgetbot click safety)
  if (!document.getElementById('chat-bubble-style')) {
    const style = document.createElement('style');
    style.id = 'chat-bubble-style';
    style.textContent = `
      /* Bubble */
      #discord-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #7289da, #404eed 80%);
        box-shadow: 0 0 20px rgba(64,78,237,0.6), 0 4px 16px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 28px;
        cursor: grab; user-select: none;
        transition: transform .25s ease, box-shadow .25s ease, opacity .4s ease;
        z-index: 9999;
        opacity: 0; pointer-events: none;
      }
      #discord-bubble.visible { opacity: 1; pointer-events: auto; }
      #discord-bubble:focus-visible {
        outline: 3px solid #fff;
        outline-offset: 4px;
      }
      #discord-bubble:hover { transform: scale(1.12); box-shadow: 0 0 30px rgba(114,137,218,0.9); }
      #discord-bubble.dragging { opacity: .85; cursor: grabbing; }
      @media (max-width: 600px) { #discord-bubble { width: 50px; height: 50px; bottom: 16px; right: 16px; } }

      /* 🔒 Click-through protection:
         All widgetbot layers are inert unless the chat is open. */
      .wb-host, .widgetbot, .widgetbot-embed, .Crate__window, .Crate__container, .Crate__backdrop, .Crate__frame {
        pointer-events: none !important;
      }
      body.wb-open .wb-host,
      body.wb-open .widgetbot,
      body.wb-open .widgetbot-embed,
      body.wb-open .Crate__window,
      body.wb-open .Crate__container,
      body.wb-open .Crate__backdrop,
      body.wb-open .Crate__frame {
        pointer-events: auto !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Create bubble
  const bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.id = 'discord-bubble';
  bubble.setAttribute('aria-label', 'Open CharlestonHacks Discord');
  bubble.title = 'CharlestonHacks Discord';
  bubble.innerHTML = '<i class="fa-brands fa-discord" aria-hidden="true"></i>';

  // Restore position if saved.
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('discordBubblePos') || 'null');
  } catch {
    localStorage.removeItem('discordBubblePos');
  }
  if (saved?.left && saved?.top) {
    bubble.style.left = saved.left;
    bubble.style.top = saved.top;
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
  }

  document.body.appendChild(bubble);
  bubble.classList.add('visible');

  // Drag handling
  let dragging = false, dragMoved = false, offsetX = 0, offsetY = 0;
  const startDrag = e => {
    dragging = true;
    dragMoved = false;
    bubble.classList.add('dragging');
    const rect = bubble.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    offsetX = p.clientX - rect.left;
    offsetY = p.clientY - rect.top;
  };
  const moveDrag = e => {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - (offsetX + bubble.getBoundingClientRect().left)) > 6 ||
        Math.abs(p.clientY - (offsetY + bubble.getBoundingClientRect().top)) > 6) {
      dragMoved = true;
    }
    if (!dragMoved) return;
    e.preventDefault();
    bubble.style.left = (p.clientX - offsetX) + 'px';
    bubble.style.top  = (p.clientY - offsetY) + 'px';
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
  };
  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    bubble.classList.remove('dragging');
    if (dragMoved) {
      localStorage.setItem('discordBubblePos', JSON.stringify({
        left: bubble.style.left, top: bubble.style.top
      }));
    }
  };

  bubble.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', stopDrag);
  bubble.addEventListener('touchstart', startDrag, { passive: true });
  window.addEventListener('touchmove', moveDrag, { passive: false });
  window.addEventListener('touchend', stopDrag);

  // Lazy load WidgetBot only when the visitor opens the chat.
  let crateReady = Boolean(window.CrateInstance);
  const initializeCrate = () => {
    if (!window.Crate) throw new Error('WidgetBot did not initialize.');
    if (!window.CrateInstance) {
      window.CrateInstance = new window.Crate({
        server: '1365587542975713320',
        channel: '1365587543696867384'
      });
    }
    crateReady = true;
    hookCrateEvents();
  };

  const ensureCrate = () => {
    if (crateReady && window.CrateInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let script = document.getElementById('widgetbot-crate');
      let settled = false;
      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        script?.removeEventListener('load', onLoad);
        script?.removeEventListener('error', onError);
        handler(value);
      };
      const onLoad = () => {
        try {
          initializeCrate();
          finish(resolve);
        } catch (error) {
          finish(reject, error);
        }
      };
      const onError = () => finish(reject, new Error('Could not load the community chat.'));
      const timeout = setTimeout(
        () => finish(reject, new Error('The community chat took too long to load.')),
        15000
      );

      if (window.Crate) {
        onLoad();
        return;
      }
      if (!script) {
        script = document.createElement('script');
        script.id = 'widgetbot-crate';
        script.src = 'https://cdn.jsdelivr.net/npm/@widgetbot/crate@3';
        script.async = true;
        script.defer = true;
      }
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (!script.isConnected) document.body.appendChild(script);
    });
  };

  function hookCrateEvents() {
    if (!window.CrateInstance || window.CrateHooked) return;
    window.CrateHooked = true;
    try {
      window.CrateInstance.on('open', () => document.body.classList.add('wb-open'));
      window.CrateInstance.on('close', () => document.body.classList.remove('wb-open'));
    } catch {
      // The open/close class is also managed when this launcher is used.
    }
  }

  const toggleChat = async () => {
    await ensureCrate();
    if (!window.CrateInstance) throw new Error('The community chat is unavailable.');
    const wasOpen = document.body.classList.contains('wb-open');
    window.CrateInstance.toggle();
    document.body.classList.toggle('wb-open', !wasOpen);
  };

  const openChat = async () => {
    await ensureCrate();
    if (!document.body.classList.contains('wb-open')) {
      window.CrateInstance.toggle();
      document.body.classList.add('wb-open');
    }
  };

  window.openCommunityChat = openChat;
  bubble.addEventListener('click', async () => {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    try {
      await toggleChat();
    } catch (error) {
      console.error('Community chat could not open:', error);
    }
  });

  console.log('Community chat launcher ready.');
}
