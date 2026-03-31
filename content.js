// ============================================================
// JobFill — content.js
// Autofill engine for job application forms
// ============================================================

(function () {
  'use strict';

  // ── Field pattern definitions ────────────────────────────
  const TEXT_PATTERNS = {
    firstName:    ['first name', 'firstname', 'first-name', 'fname', 'given name', 'given-name', 'legal first'],
    lastName:     ['last name', 'lastname', 'last-name', 'lname', 'family name', 'surname', 'legal last'],
    email:        ['email', 'e-mail', 'email address', 'work email'],
    phone:        ['phone', 'telephone', 'mobile', 'cell', 'phone number', 'contact number', 'direct phone'],
    city:         ['city', 'town', 'municipality'],
    state:        ['state', 'province', 'region', 'state/province'],
    country:      ['country', 'nation'],
    zipCode:      ['zip', 'postal code', 'zip code', 'postcode'],
    location:     ['current location', 'city, state', 'city/state', 'city, state/province'],
    linkedin:     ['linkedin', 'linked in', 'linkedin profile', 'linkedin url', 'linkedin.com'],
    website:      ['website', 'portfolio', 'personal site', 'personal website', 'web site', 'portfolio url', 'personal url'],
    salary:       ['salary', 'compensation', 'expected salary', 'desired salary', 'salary expectation', 'pay expectation', 'salary range', 'desired compensation'],
    referral:     ['referred by', 'referral name', 'employee name', 'who referred you', 'employee referral'],
    hearAbout:    ['how did you hear', 'how did you find out', 'how did you learn about', 'source of referral', 'how were you referred', 'how did you discover'],
    coverLetterText: ['cover letter', 'additional information', 'anything else', 'message to hiring', 'introduction', 'tell us why'],
    jobTitle:     ['job title', 'position', 'title', 'position title', 'job position', 'current title'],
    company:      ['company', 'employer', 'company name', 'organization', 'organization name', 'current company'],
    workLocation: ['work location', 'location', 'job location', 'where did you work', 'employment location'],
    startDate:    ['start date', 'start month', 'from', 'from date', 'from month', 'employment start', 'began', 'started work'],
    endDate:      ['end date', 'end month', 'to', 'to date', 'to month', 'employment end', 'finish', 'completion date'],
    description:  ['description', 'role description', 'job description', 'responsibilities', 'what did you do', 'tell us about', 'duties', 'achievements'],
  };

  // Yes/No question patterns
  const YES_NO_PATTERNS = {
    workAuthorized: {
      patterns: ['authorized to work', 'legally authorized', 'eligible to work in the united states', 'eligible to work in the us', 'work authorization', 'right to work'],
      yesKey: 'workAuthorized',
      yesValue: 'yes',
    },
    requireSponsorship: {
      patterns: ['sponsorship', 'visa sponsorship', 'immigration sponsorship', 'h-1b', 'employment visa', 'require sponsorship', 'need sponsorship'],
      yesKey: 'requireSponsorship',
      yesValue: 'yes',
    },
    hasNonCompete: {
      patterns: ['non-compete', 'non compete', 'noncompete', 'non-solicitation', 'restrictive agreement', 'restrictive covenant', 'confidentiality agreement that would restrict'],
      yesKey: 'hasNonCompete',
      yesValue: 'yes',
    },
  };

  // EEO patterns
  const EEO_PATTERNS = {
    gender:     ['gender', 'sex', 'gender identity'],
    race:       ['race', 'ethnicity', 'racial', 'ethnic'],
    veteran:    ['veteran', 'military service', 'protected veteran', 'military status'],
    disability: ['disability', 'disabled', 'accommodation', 'disability status'],
  };

  // ── Get all text labels for an element ──────────────────
  function getElementLabels(el) {
    const labels = new Set();

    const add = (text) => {
      if (text && text.trim()) labels.add(text.trim().toLowerCase());
    };

    // aria-label
    add(el.getAttribute('aria-label'));

    // aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      labelledBy.split(' ').forEach(id => {
        const lEl = document.getElementById(id);
        if (lEl) add(lEl.textContent);
      });
    }

    // Associated <label for="id">
    if (el.id) {
      document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`).forEach(lEl => add(lEl.textContent));
    }

    // Parent <label>
    const parentLabel = el.closest('label');
    if (parentLabel) add(parentLabel.textContent);

    // placeholder & name & id (as hints)
    add(el.placeholder);
    if (el.name) add(el.name.replace(/[-_[\]]/g, ' '));
    if (el.id) add(el.id.replace(/[-_[\]]/g, ' '));

    // Preceding siblings (catch custom label-like divs/spans)
    let prev = el.previousElementSibling;
    let count = 0;
    while (prev && count < 2) {
      const tag = prev.tagName?.toLowerCase();
      if (['label', 'span', 'p', 'div', 'legend', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        add(prev.textContent);
      }
      prev = prev.previousElementSibling;
      count++;
    }

    // Parent's direct text (not the input itself)
    const parent = el.parentElement;
    if (parent) {
      const directText = Array.from(parent.childNodes)
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent)
        .join(' ');
      add(directText);

      // Also check parent's parent (one more level)
      const grandparent = parent.parentElement;
      if (grandparent) {
        const gpLabel = grandparent.querySelector('label, legend, [class*="label"], [class*="question"]');
        if (gpLabel && gpLabel !== el) add(gpLabel.textContent);
      }
    }

    // data-label, data-field-name, data-placeholder
    ['data-label', 'data-field-name', 'data-placeholder', 'data-qa', 'data-testid'].forEach(attr => {
      add(el.getAttribute(attr));
    });

    return Array.from(labels);
  }

  // ── Check if labels match any pattern ───────────────────
  function matchesPattern(labels, patterns) {
    return patterns.some(pattern =>
      labels.some(label => label.includes(pattern))
    );
  }

  // ── React-safe value setter for text inputs ──────────────
  function setInputValue(el, value) {
    try {
      // Use native prototype setter (works with React controlled inputs)
      const proto = Object.getPrototypeOf(el);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, value);
      } else {
        el.value = value;
      }
    } catch (e) {
      el.value = value;
    }

    // Fire all relevant events
    ['input', 'change', 'blur', 'keyup'].forEach(type => {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    });
  }

  // ── Set a <select> value by fuzzy text matching ──────────
  function setSelectValue(el, targetValue) {
    if (!targetValue || targetValue === 'decline') return false;

    const target = targetValue.toLowerCase();
    const options = Array.from(el.options);

    // 1. Exact value match
    let match = options.find(o => o.value.toLowerCase() === target);

    // 2. Exact text match
    if (!match) match = options.find(o => o.text.toLowerCase().trim() === target);

    // 3. Target contains option text OR option text contains target
    if (!match) match = options.find(o => {
      const ot = o.text.toLowerCase().trim();
      return ot && ot !== '' && ot !== 'select' && (target.includes(ot) || ot.includes(target));
    });

    // 4. Fuzzy: shared significant words
    if (!match) {
      const targetWords = target.split(/\s+/).filter(w => w.length > 2);
      match = options.find(o => {
        const ot = o.text.toLowerCase();
        return targetWords.some(w => ot.includes(w));
      });
    }

    if (match) {
      el.value = match.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  // ── Click a radio/button option by value/label ───────────
  function clickRadioOption(radios, targetValue) {
    if (!targetValue) return false;
    const target = targetValue.toLowerCase().trim();

    // Try matching by value attribute
    let match = radios.find(r => r.value?.toLowerCase().trim() === target);

    // Try matching by associated label text
    if (!match) {
      match = radios.find(r => {
        const labels = getElementLabels(r);
        return labels.some(l => l.includes(target) || target.includes(l));
      });
    }

    // Partial value match
    if (!match) {
      match = radios.find(r => {
        const v = r.value?.toLowerCase() || '';
        return v.startsWith(target) || target.startsWith(v);
      });
    }

    if (match) {
      match.click();
      match.checked = true;
      match.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  // ── Build a stable key for radio grouping ────────────────
  function getRadioGroupKey(radio, index) {
    if (radio.name) return `name:${radio.name}`;

    const groupContainer = radio.closest('[role="radiogroup"], fieldset, [data-question], [data-testid], .question, .form-group');
    if (groupContainer) {
      if (!groupContainer.dataset.jobfillGroupKey) {
        groupContainer.dataset.jobfillGroupKey = `group_${Math.random().toString(36).slice(2, 10)}`;
      }
      return `container:${groupContainer.dataset.jobfillGroupKey}`;
    }

    return `single:${index}`;
  }

  // ── Get labels for a radio group ────────────────────────
  function getGroupLabels(radios, groupName) {
    const labels = new Set();
    const addText = (t) => { if (t?.trim()) labels.add(t.trim().toLowerCase()); };

    // Group name itself
    addText(groupName?.replace(/[-_]/g, ' '));

    // Look for a fieldset legend containing these radios
    if (radios[0]) {
      const fieldset = radios[0].closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) addText(legend.textContent);
      }

      // Parent container label-like elements
      const container = radios[0].closest('[role="group"], [role="radiogroup"], fieldset, .form-group, .field, .question');
      if (container) {
        ['legend', 'label', 'h1', 'h2', 'h3', 'h4', 'p', 'span', '[class*="label"]', '[class*="question"]', '[class*="title"]'].forEach(selector => {
          container.querySelectorAll(selector).forEach(el => {
            // Only include if not inside a radio option itself
            if (!el.closest('label[for], .radio-option')) {
              addText(el.textContent);
            }
          });
        });

        // aria-label on group container
        addText(container.getAttribute('aria-label'));
        const lby = container.getAttribute('aria-labelledby');
        if (lby) {
          lby.split(' ').forEach(id => {
            const lEl = document.getElementById(id);
            if (lEl) addText(lEl.textContent);
          });
        }
      }
    }

    return Array.from(labels);
  }

  // ── Highlight a file upload field ───────────────────────
  function highlightFileField(el, labelText) {
    const wrapper = el.closest('.form-group, .field, div, li') || el.parentElement;
    if (wrapper && wrapper !== document.body) {
      wrapper.style.outline = '2px dashed #D4A843';
      wrapper.style.outlineOffset = '4px';
      wrapper.style.borderRadius = '4px';
    }
    el.title = `JobFill: Please upload your ${labelText || 'file'} manually`;
  }

  // ── Handle custom dropdown UIs (div-based) ───────────────
  function tryCustomDropdown(container, value) {
    if (!value || value === 'decline') return false;
    const target = value.toLowerCase();

    // Look for listbox role or common custom dropdown patterns
    const listbox = container.querySelector('[role="listbox"], [role="option"]')
      ?.closest('[role="listbox"]') || container.querySelector('ul, ol');

    if (!listbox) return false;

    const items = listbox.querySelectorAll('[role="option"], li');
    let match = null;
    items.forEach(item => {
      const text = item.textContent.toLowerCase().trim();
      if (text.includes(target) || target.includes(text)) match = item;
    });

    if (match) {
      match.click();
      return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════
  // MAIN AUTOFILL FUNCTION
  // ══════════════════════════════════════════════════════════
  function autofill(profile, workExperience = []) {
    let filled = 0;
    let fileHighlights = 0;

    // ── 1. Text inputs and textareas ─────────────────────
    const textEls = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], textarea'
    );

    textEls.forEach(el => {
      if (el.disabled || el.readOnly) return;
      
      const labels = getElementLabels(el);
      if (!labels.length) return;

      for (const [field, patterns] of Object.entries(TEXT_PATTERNS)) {
        if (matchesPattern(labels, patterns) && profile[field]) {
          // Special case: "location" field — combine city + state if it's a single text field
          let value = profile[field];
          if (field === 'location') {
            value = [profile.city, profile.state].filter(Boolean).join(', ');
          }
          // Special case: "email" field — detect format and generate if needed
          if (field === 'email' && profile.firstName && profile.lastName) {
            const emailInfo = detectEmailFormat();
            if (emailInfo?.detectedFormat) {
              value = generateEmailFromFormat(profile.firstName, profile.lastName, emailInfo.detectedFormat, emailInfo.domain) || value;
            }
          }
          if (value) {
            setInputValue(el, value);
            filled++;
            return; // Next element
          }
        }
      }
    });

    // ── 1.5. Work experience fields ──────────────────────
    // Map repeated work experience fields by index so each saved job entry
    // fills its corresponding row instead of repeating only the first job.
    if (workExperience.length > 0) {
      const workLabels = new Map([
        ['jobTitle', TEXT_PATTERNS.jobTitle],
        ['company', TEXT_PATTERNS.company],
        ['workLocation', TEXT_PATTERNS.workLocation],
        ['startDate', TEXT_PATTERNS.startDate],
        ['endDate', TEXT_PATTERNS.endDate],
        ['description', TEXT_PATTERNS.description],
      ]);

      const workFieldEls = new Map();
      workLabels.forEach((_, field) => workFieldEls.set(field, []));

      textEls.forEach(el => {
        if (el.disabled || el.readOnly) return;

        const labels = getElementLabels(el);
        if (!labels.length) return;

        for (const [field, patterns] of workLabels.entries()) {
          if (matchesPattern(labels, patterns)) {
            workFieldEls.get(field).push(el);
            break;
          }
        }
      });

      workFieldEls.forEach((elements, field) => {
        elements.forEach((el, index) => {
          const job = workExperience[index];
          if (!job) return;

          const value = field === 'workLocation'
            ? (job.workLocation || job.location)
            : job[field];

          if (value) {
            setInputValue(el, value);
            filled++;
          }
        });
      });
    }

    // ── 2. File uploads ─────────────────────────────────
    document.querySelectorAll('input[type="file"]').forEach(el => {
      const labels = getElementLabels(el);
      const labelText = labels.join(' ');
      if (labelText.includes('resume') || labelText.includes('cv') || labelText.includes('curriculum vitae')) {
        highlightFileField(el, 'resume / CV');
        fileHighlights++;
      } else if (labelText.includes('cover letter')) {
        highlightFileField(el, 'cover letter');
        fileHighlights++;
      }
    });

    // ── 3. Select dropdowns ──────────────────────────────
    document.querySelectorAll('select').forEach(el => {
      if (el.disabled) return;
      
      const labels = getElementLabels(el);

      // Location dropdowns
      if (matchesPattern(labels, TEXT_PATTERNS.country)) {
        if (setSelectValue(el, profile.country)) filled++;
      } else if (matchesPattern(labels, TEXT_PATTERNS.state)) {
        if (setSelectValue(el, profile.state)) filled++;
      } else if (matchesPattern(labels, TEXT_PATTERNS.city)) {
        if (setSelectValue(el, profile.city)) filled++;
      }
      // EEO dropdowns
      else if (matchesPattern(labels, EEO_PATTERNS.gender)) {
        if (setSelectValue(el, profile.gender)) filled++;
      } else if (matchesPattern(labels, EEO_PATTERNS.race)) {
        if (setSelectValue(el, profile.race)) filled++;
      } else if (matchesPattern(labels, EEO_PATTERNS.veteran)) {
        if (setSelectValue(el, profile.veteran)) filled++;
      } else if (matchesPattern(labels, EEO_PATTERNS.disability)) {
        if (setSelectValue(el, profile.disability)) filled++;
      }
      // How did you hear
      else if (matchesPattern(labels, TEXT_PATTERNS.hearAbout)) {
        if (setSelectValue(el, profile.hearAbout)) filled++;
      }
      // Work auth yes/no
      else {
        for (const [, config] of Object.entries(YES_NO_PATTERNS)) {
          if (matchesPattern(labels, config.patterns)) {
            const val = profile[config.yesKey];
            if (setSelectValue(el, val)) filled++;
            break;
          }
        }
      }
    });

    // ── 4. Radio button groups ───────────────────────────
    const radioGroups = new Map();
    document.querySelectorAll('input[type="radio"]').forEach((radio, index) => {
      const key = getRadioGroupKey(radio, index);
      if (!radioGroups.has(key)) radioGroups.set(key, []);
      radioGroups.get(key).push(radio);
    });

    radioGroups.forEach((radios, groupName) => {
      const groupLabels = getGroupLabels(radios, groupName);

      // Yes/No patterns
      for (const [, config] of Object.entries(YES_NO_PATTERNS)) {
        if (matchesPattern(groupLabels, config.patterns)) {
          const answer = profile[config.yesKey]; // 'yes' or 'no'
          if (answer && clickRadioOption(radios, answer)) filled++;
          break;
        }
      }

      // EEO radio groups
      for (const [field, patterns] of Object.entries(EEO_PATTERNS)) {
        if (matchesPattern(groupLabels, patterns)) {
          const val = profile[field];
          if (val && val !== 'decline' && clickRadioOption(radios, val)) filled++;
          break;
        }
      }

      // Work auth as radio (some forms use radio instead of dropdown)
      if (matchesPattern(groupLabels, TEXT_PATTERNS.hearAbout)) {
        if (profile.hearAbout && clickRadioOption(radios, profile.hearAbout)) filled++;
      }
    });

    // ── 5. Custom role="radio" elements (Greenhouse, Lever, etc.) ──
    const ariaRadioGroups = new Map();
    document.querySelectorAll('[role="radio"]').forEach(el => {
      const group = el.closest('[role="radiogroup"], [role="group"], fieldset, .question, .form-field');
      const key = group?.id || group?.getAttribute('aria-labelledby') || group?.className || Math.random();
      if (!ariaRadioGroups.has(key)) ariaRadioGroups.set(key, { group, items: [] });
      ariaRadioGroups.get(key).items.push(el);
    });

    ariaRadioGroups.forEach(({ group, items }) => {
      const groupEl = group;
      const groupText = groupEl
        ? (groupEl.querySelector('legend, [class*="label"], [class*="question"], h1, h2, h3, h4, p')?.textContent || groupEl.getAttribute('aria-label') || '')
        : '';
      const labels = [groupText.toLowerCase()];

      for (const [, config] of Object.entries(YES_NO_PATTERNS)) {
        if (matchesPattern(labels, config.patterns)) {
          const answer = profile[config.yesKey];
          if (!answer) break;
          const match = items.find(item => {
            const t = (item.textContent + item.getAttribute('aria-label') + item.dataset.value || '').toLowerCase();
            return t.includes(answer);
          });
          if (match) {
            match.click();
            match.setAttribute('aria-checked', 'true');
            filled++;
          }
          break;
        }
      }
    });

    // ── 6. Non-compete explanation ───────────────────────
    if (profile.hasNonCompete === 'yes' && profile.nonCompeteExplanation) {
      const allTextareas = document.querySelectorAll('textarea');
      allTextareas.forEach(ta => {
        const labels = getElementLabels(ta);
        if (matchesPattern(labels, ['explain', 'describe', 'detail', 'if yes', 'please explain'])) {
          // Only fill if near a non-compete question
          const container = ta.closest('.form-group, .field, fieldset, section') || ta.parentElement;
          const containerText = container?.textContent?.toLowerCase() || '';
          if (containerText.includes('non-compete') || containerText.includes('restrictive') || containerText.includes('agreement')) {
            setInputValue(ta, profile.nonCompeteExplanation);
            filled++;
          }
        }
      });
    }

    return { filled, fileHighlights };
  }

  // ══════════════════════════════════════════════════════════
  // EMAIL FORMAT DETECTION
  // ══════════════════════════════════════════════════════════
  function detectEmailFormat() {
    const emails = new Set();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    // Scan mailto links
    document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
      const href = link.getAttribute('href');
      const match = href.match(emailRegex);
      if (match) emails.add(match[0].toLowerCase());
    });

    // Scan visible text for emails
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node;
    while (node = walker.nextNode()) {
      const matches = node.textContent.match(emailRegex);
      if (matches) matches.forEach(e => emails.add(e.toLowerCase()));
    }

    if (emails.size === 0) return null;

    // Analyze patterns
    const patterns = {};
    const domain = new URL(window.location.href).hostname.replace('www.', '');

    Array.from(emails).forEach(email => {
      const [localPart, domainPart] = email.split('@');
      
      // Only count emails from current domain
      if (!domainPart.includes(domain.split('.')[0])) return;

      // Detect pattern type
      let pattern = 'unknown';
      if (localPart.includes('.')) {
        if (localPart.match(/^[a-z]\.?[a-z]/)) pattern = 'first.last or f.last';
        else pattern = 'firstname.lastname';
      } else if (localPart.includes('_')) {
        pattern = 'first_last';
      } else if (localPart.match(/^[a-z]{2,}[a-z]{2,}$/)) {
        pattern = 'firstlast';
      } else {
        pattern = 'other';
      }

      patterns[pattern] = (patterns[pattern] || 0) + 1;
    });

    // Find most common pattern
    const sortedPatterns = Object.entries(patterns).sort((a, b) => b[1] - a[1]);
    const mostCommon = sortedPatterns[0]?.[0] || null;

    return {
      detectedFormat: mostCommon,
      domain: domainPart || domain,
      emailCount: emails.size,
      examples: Array.from(emails).slice(0, 3),
      rawDomain: domain
    };
  }

  function generateEmailFromFormat(firstName, lastName, format, domainPart) {
    if (!firstName || !lastName || !format) return null;

    const fn = firstName.toLowerCase().trim();
    const ln = lastName.toLowerCase().trim();

    let localPart = '';
    if (format.includes('first.last') || format.includes('f.last')) {
      localPart = `${fn[0]}.${ln}`;
    } else if (format === 'firstname.lastname') {
      localPart = `${fn}.${ln}`;
    } else if (format === 'first_last') {
      localPart = `${fn}_${ln}`;
    } else if (format === 'firstlast') {
      localPart = `${fn}${ln}`;
    } else {
      // Fallback to firstname.lastname
      localPart = `${fn}.${ln}`;
    }

    return domainPart ? `${localPart}@${domainPart}` : null;
  }

  // ══════════════════════════════════════════════════════════
  // FLOATING TRIGGER BUTTON
  // ══════════════════════════════════════════════════════════
  function injectFloatingButton() {
    if (document.getElementById('jobfill-float')) return;

    const btn = document.createElement('div');
    btn.id = 'jobfill-float';

    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '22px',
      right: '22px',
      background: '#D4A843',
      color: '#0A0A0C',
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      fontSize: '11px',
      fontWeight: '600',
      letterSpacing: '0.06em',
      padding: '8px 14px',
      borderRadius: '5px',
      cursor: 'pointer',
      zIndex: '2147483647',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(212,168,67,0.3)',
      userSelect: 'none',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    });

    btn.innerHTML = '<span style="font-size:10px">◆</span> JOBFILL';

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,168,67,0.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(212,168,67,0.3)';
    });

    btn.addEventListener('click', () => {
      chrome.storage.local.get('jobfillProfile', ({ jobfillProfile }) => {
        if (!jobfillProfile || !jobfillProfile.firstName) {
          showInlineToast('Open the JobFill extension to save your profile first.', 'warn');
          return;
        }
        const result = autofill(jobfillProfile);
        showInlineToast(`◆ ${result.filled} field${result.filled !== 1 ? 's' : ''} filled${result.fileHighlights > 0 ? ` · ${result.fileHighlights} file field${result.fileHighlights !== 1 ? 's' : ''} highlighted` : ''}`, 'success');
      });
    });

    document.body.appendChild(btn);
  }

  // ── Inline toast notification (shown on the page itself) ─
  function showInlineToast(message, type = 'success') {
    const existing = document.getElementById('jobfill-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'jobfill-toast';

    const colors = {
      success: { bg: '#1a1a1d', border: '#D4A843', text: '#D4A843' },
      warn:    { bg: '#1a1a1d', border: '#F87171', text: '#F87171' },
    };
    const c = colors[type] || colors.success;

    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '70px',
      right: '22px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      fontSize: '11px',
      fontWeight: '500',
      padding: '9px 14px',
      borderRadius: '5px',
      zIndex: '2147483646',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      maxWidth: '280px',
      lineHeight: '1.4',
      animation: 'none',
      opacity: '1',
      transition: 'opacity 0.3s ease',
    });

    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ── Only inject button if page has a form ───────────────
  function shouldInject() {
    return document.querySelector('form, [data-form], [class*="application"], [class*="apply"]') !== null;
  }

  // ── Listen for messages from the popup ──────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'autofill') {
      // Get work experience from storage
      chrome.storage.local.get('workExperience', (result) => {
        const workExperience = result.workExperience || [];
        const result_obj = autofill(message.profile, workExperience);
        sendResponse(result_obj);
      });
      return true; // Will respond asynchronously
    } else if (message.action === 'detectEmail') {
      const emailInfo = detectEmailFormat();
      sendResponse(emailInfo);
    }
    return true;
  });

  // ── Init: inject floating button if on a form page ──────
  if (shouldInject()) {
    // Wait a beat for dynamic pages (React, etc.)
    setTimeout(injectFloatingButton, 800);
  }

  // Also inject on dynamic navigation (SPAs)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => {
        if (shouldInject()) injectFloatingButton();
      }, 1000);
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }, { once: true });
  }

})();
