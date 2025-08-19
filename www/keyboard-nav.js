(function() {
  'use strict';
  
  let isInitialized = false;
  const DEBUG = true; // Enable for debugging
  const inputState = { mark_start: undefined, mark_end: undefined, single_image: undefined };
  
  function log(...args) {
    if (DEBUG) console.log('[KeyboardNav]', ...args);
  }
  
  function error(...args) {
    console.error('[KeyboardNav]', ...args);
  }
  
  // Check if we're typing in an input field
  function isInInputField() {
    const active = document.activeElement;
    if (!active) return false;
    
    const tagName = active.tagName.toLowerCase();
    const inputTypes = ['input', 'textarea', 'select'];
    
    if (inputTypes.includes(tagName)) {
      log('Ignoring keypress - active element is', tagName);
      return true;
    }
    
    if (active.contentEditable === 'true') {
      log('Ignoring keypress - content editable');
      return true;
    }
    
    return false;
  }
  
  // Utility: is element visible
  function isVisible(el) { return !!(el && (el.offsetParent !== null)); }

  // Find checkbox with multiple strategies; prefer those inside the annotation section
  function findCheckbox(baseId) {
    log(`Looking for checkbox with base id: ${baseId}`);
    const scope = document.querySelector('.sequence-annotation-body') || document;

    const candidates = [];

    // Strategy 1: Direct ID in scope and document
    const direct = document.getElementById(baseId);
    if (direct && direct.type === 'checkbox') candidates.push(direct);

    // Strategy 2: Ends-with id within scope
    scope.querySelectorAll(`input[type="checkbox"][id$="${baseId}"]`).forEach(el => candidates.push(el));

    // Strategy 3: Name attribute within scope
    scope.querySelectorAll(`input[type="checkbox"][name="${baseId}"]`).forEach(el => candidates.push(el));

    // Strategy 4: Partial id within scope
    scope.querySelectorAll('input[type="checkbox"]').forEach(el => {
      if (el.id && el.id.includes(baseId)) candidates.push(el);
    });

    // Deduplicate
    const unique = Array.from(new Set(candidates));

    // Prefer visible and id ending with baseId
    const visible = unique.filter(isVisible);
    const preferred = visible.sort((a,b) => {
      const aEnds = a.id && a.id.endsWith(baseId) ? 1 : 0;
      const bEnds = b.id && b.id.endsWith(baseId) ? 1 : 0;
      return bEnds - aEnds; // prefer ends-with true
    });

    if (preferred.length) {
      log(`Found checkbox: ${preferred[0].id}`);
      return preferred[0];
    }

    // Strategy 5: Try label within scope
    const label = scope.querySelector(`label[for$="${baseId}"]`);
    if (label) {
      const forId = label.getAttribute('for');
      if (forId) {
        const el = document.getElementById(forId);
        if (el && el.type === 'checkbox') {
          log(`Found via label: ${forId}`);
          return el;
        }
      }
    }

    error(`Could not find checkbox for: ${baseId}`);
    return null;
  }
  
  // Toggle checkbox with multiple methods
  function toggleCheckbox(baseId) {
    const checkbox = findCheckbox(baseId);
    const currentKnown = inputState[baseId];
    const currentState = (currentKnown !== undefined) ? !!currentKnown : (!!(checkbox && checkbox.checked));
    if (!checkbox) {
      error(`Cannot toggle - checkbox not found: ${baseId}`);
      // Try direct Shiny toggle using known state
      const next = !currentState;
      if (window.Shiny && window.Shiny.setInputValue) {
        try { window.Shiny.setInputValue(baseId, next, { priority: 'event' }); inputState[baseId] = next; return true; } catch (e) {}
      }
      return false;
    }
    log(`Toggling ${baseId}: ${currentState} -> ${!currentState}`);
    
    try {
      // Method 1: Direct click (most reliable with Shiny)
      checkbox.click();
      log(`Successfully clicked ${baseId}`);
      
      // Verify the change happened; if not, try clicking associated label then fallback
      setTimeout(() => {
        if (checkbox.checked !== currentState) {
          log(`✓ State changed successfully for ${baseId}`);
          inputState[baseId] = checkbox.checked;
        } else {
          // Try clicking the label associated with the checkbox
          const label = document.querySelector(`label[for='${checkbox.id}']`);
          if (label) {
            try { label.click(); log(`Clicked label for ${baseId}`); } catch (e) { log(`Label click failed for ${baseId}:`, e); }
          }
          // Re-check
          setTimeout(() => {
            if (checkbox.checked !== currentState) {
              log(`✓ State changed after label click for ${baseId}`);
              inputState[baseId] = checkbox.checked;
            } else {
              error(`✗ State still did not change for ${baseId}; using fallback`);
              fallbackToggle(checkbox, baseId, currentState);
            }
          }, 60);
        }
      }, 80);
      
      return true;
      
    } catch (err) {
      error(`Click failed for ${baseId}:`, err);
      return fallbackToggle(checkbox, baseId, currentState);
    }
  }
  
  // Fallback toggle method
  function fallbackToggle(checkbox, baseId, currentState) {
    try {
      // Method 2: Manual state change + events
      checkbox.checked = !currentState;
      
      // Fire multiple events to ensure Shiny picks it up
      const events = ['input', 'change'];
      events.forEach(eventType => {
        checkbox.dispatchEvent(new Event(eventType, { 
          bubbles: true, 
          cancelable: true 
        }));
      });
      
      // Method 3: Direct Shiny notification
      if (window.Shiny && window.Shiny.setInputValue) {
        const actualId = checkbox.id || baseId;
        try { window.Shiny.setInputValue(actualId, checkbox.checked, { priority: 'event' }); } catch (e) {}
        if (actualId !== baseId) {
          try { window.Shiny.setInputValue(baseId, checkbox.checked, { priority: 'event' }); } catch (e) {}
        }
        log(`Sent value to Shiny for ${baseId}/${actualId}: ${checkbox.checked}`);
      }
      inputState[baseId] = checkbox.checked;
      
      log(`Fallback toggle completed for ${baseId}`);
      return true;
      
    } catch (err) {
      error(`Fallback toggle failed for ${baseId}:`, err);
      return false;
    }
  }
  
  // Main keyboard handler
  function handleKeyPress(event) {
    // Ignore if typing in input fields
    if (isInInputField()) {
      return;
    }
    
    // Ignore if event already handled
    if (event.defaultPrevented) {
      return;
    }
    
    // Ignore key repeats (holding down key)
    if (event.repeat) {
      return;
    }
    
    const key = event.key.toLowerCase();
    let handled = false;
    
    switch (key) {
      case 's':
        log('S key pressed - toggling mark_start');
        handled = toggleCheckbox('mark_start');
        break;
        
      case 'e':
        log('E key pressed - toggling mark_end');
        handled = toggleCheckbox('mark_end');
        break;
        
      case 'i':
        log('I key pressed - toggling single_image');
        handled = toggleCheckbox('single_image');
        break;
    }
    
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  
  // Initialize keyboard handling
  function initKeyboardHandling() {
    if (isInitialized) {
      log('Already initialized, skipping');
      return;
    }
    
    log('Initializing keyboard handling...');
    
    // Test if we can find the checkboxes
    const testIds = ['mark_start', 'mark_end', 'single_image'];
    testIds.forEach(id => {
      const found = findCheckbox(id);
      if (found) {
        log(`✓ Found checkbox: ${id} (actual id: ${found.id})`);
      } else {
        error(`✗ Could not find checkbox: ${id}`);
      }
    });
    
    // Listen on both document and window for maximal capture
    document.addEventListener('keydown', handleKeyPress, {
      passive: false,
      capture: true // Use capture phase to ensure we get the event first
    });
    window.addEventListener('keydown', handleKeyPress, { passive: false, capture: true });
    // Add keypress as a fallback on some browsers
    document.addEventListener('keypress', handleKeyPress, { passive: false, capture: true });
    window.addEventListener('keypress', handleKeyPress, { passive: false, capture: true });

    // Track Shiny input changes to keep inputState in sync
    if (window.jQuery) {
      jQuery(document).on('shiny:inputchanged', function(e, data){
        const name = (data && data.name) || (e && e.name) || '';
        if (name === 'mark_start' || name === 'mark_end' || name === 'single_image') {
          inputState[name] = !!data.value;
          log(`Shiny updated ${name} -> ${inputState[name]}`);
        }
      });
    }
    
    isInitialized = true;
    log('Keyboard handling initialized successfully');
  }
  
  // Wait for DOM and Shiny to be ready
  function whenReady() {
    // Multiple initialization strategies
    
    // 1. If jQuery and Shiny are available, wait for connection
    if (window.jQuery && window.jQuery.fn) {
      jQuery(document).on('shiny:connected', function() {
        log('Shiny connected - initializing in 200ms');
        setTimeout(initKeyboardHandling, 200);
      });
    }
    
    // 2. DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        log('DOM ready - initializing in 200ms');
        setTimeout(initKeyboardHandling, 200);
      });
    } else {
      log('DOM already ready - initializing in 200ms');
      setTimeout(initKeyboardHandling, 200);
    }
    
    // 3. Fallback timer
    setTimeout(function() {
      if (!isInitialized) {
        log('Fallback initialization after 3 seconds');
        initKeyboardHandling();
      }
    }, 3000);
  }
  
  // Start initialization
  whenReady();
  
  // Global debugging function
  window.debugKeyboardNav = function() {
    console.log('=== Keyboard Navigation Debug ===');
    console.log('Initialized:', isInitialized);
    
    const testIds = ['mark_start', 'mark_end', 'single_image'];
    testIds.forEach(id => {
      const found = findCheckbox(id);
      console.log(`${id}:`, found ? found.id : 'NOT FOUND');
      if (found) {
        console.log(`  - checked: ${found.checked}`);
        console.log(`  - visible: ${found.offsetParent !== null}`);
      }
    });
    
    console.log('Active element:', document.activeElement);
    console.log('=== End Debug ===');
  };
  
})();
