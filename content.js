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
    startDate:    ['start date', 'start month', 'from date', 'from month', 'employment start', 'began', 'started work'],
    endDate:      ['end date', 'end month', 'to date', 'to month', 'employment end', 'finish', 'completion date'],
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

  function isDateFieldName(field) {
    return field === 'startDate' || field === 'endDate';
  }

  // ── Attribute-based fallback field detection ───────────
  function detectFieldFromAttributes(el) {
    const rawPieces = [
      el.name,
      el.id,
      el.getAttribute('autocomplete'),
      el.getAttribute('aria-label'),
      el.getAttribute('data-automation-id'),
      el.getAttribute('data-automation-label'),
      el.getAttribute('data-uxi-element-id'),
      el.getAttribute('data-field'),
      el.getAttribute('data-testid'),
      el.placeholder,
    ].filter(Boolean);

    const camelSplit = rawPieces
      .map(v => String(v).replace(/([a-z])([A-Z])/g, '$1 $2'))
      .join(' ');

    const haystack = camelSplit.toLowerCase();

    if (!haystack) return null;

    const hasWord = (token) => new RegExp(`(^|[^a-z])${token}([^a-z]|$)`, 'i').test(haystack);

    if (hasWord('first') && hasWord('name')) return 'firstName';
    if (hasWord('last') && hasWord('name')) return 'lastName';
    if (hasWord('email')) return 'email';
    if (hasWord('phone') || hasWord('mobile') || hasWord('telephone') || hasWord('tel')) return 'phone';
    if ((hasWord('postal') || hasWord('zip')) && hasWord('code')) return 'zipCode';
    if (hasWord('linkedin')) return 'linkedin';
    if (hasWord('website') || hasWord('portfolio') || hasWord('url')) return 'website';
    if (hasWord('city')) return 'city';
    if (hasWord('state') || hasWord('province') || hasWord('region')) return 'state';
    if (hasWord('country')) return 'country';
    if (hasWord('salary') || hasWord('compensation')) return 'salary';
    if ((hasWord('start') || hasWord('from')) && (hasWord('date') || hasWord('month'))) return 'startDate';
    if ((hasWord('end') || hasWord('to')) && (hasWord('date') || hasWord('month'))) return 'endDate';

    return null;
  }

  function isWorkdaySite() {
    const host = (window.location.hostname || '').toLowerCase();
    return host.includes('workday.com') || host.includes('myworkdayjobs.com');
  }

  // ── React-safe value setter for text inputs ──────────────
  function setInputValue(el, value, options = {}) {
    const { isDateLike = false } = options;

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

    // Workday is sensitive to synthetic key floods; keep the baseline events small.
    const eventTypes = isWorkdaySite() ? ['input', 'change'] : ['input', 'change', 'keyup'];
    if (isDateLike && !eventTypes.includes('blur')) {
      eventTypes.push('blur');
    }
    eventTypes.forEach(type => {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    });
  }

  // ── Normalize date values for date/month controls ───────
  function parseDateParts(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return null;

    let m = raw.match(/^(\d{1,2})[\/\-](\d{4})$/); // MM/YYYY or MM-YYYY
    if (m) {
      const month = Number(m[1]);
      const year = Number(m[2]);
      if (month >= 1 && month <= 12) return { year, month, day: 1 };
    }

    m = raw.match(/^(\d{4})[\/\-](\d{1,2})(?:[\/\-](\d{1,2}))?$/); // YYYY-MM or YYYY-MM-DD
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3] || 1);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }

    m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // MM/DD/YYYY
    if (m) {
      const month = Number(m[1]);
      const day = Number(m[2]);
      const year = Number(m[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }

    return null;
  }

  function normalizeValueForElement(el, value, field) {
    if (!value) return value;

    const raw = String(value).trim();
    const type = (el.type || '').toLowerCase();
    const isExperienceDate = isDateFieldName(field);

    if (!isExperienceDate || !type) return raw;

    const parsed = parseDateParts(raw);
    if (!parsed) return raw;

    const mm = String(parsed.month).padStart(2, '0');
    const yyyy = String(parsed.year);
    const dd = String(parsed.day || 1).padStart(2, '0');

    if (type === 'month') {
      return `${yyyy}-${mm}`;
    }

    if (type === 'date') {
      return `${yyyy}-${mm}-${dd}`;
    }

    if (type === 'datetime-local') {
      return `${yyyy}-${mm}-${dd}T00:00`;
    }

    // Keep month/year for text-like date inputs used by many ATS UIs.
    if (type === 'text' || type === 'search' || type === 'tel' || type === 'number') {
      return `${mm}/${yyyy}`;
    }

    return raw;
  }

  const MONTH_NAMES = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];

  function getDateSelectPart(el, labels = []) {
    const labelText = labels.join(' ').toLowerCase();
    if (labelText.includes('month')) return 'month';
    if (labelText.includes('year')) return 'year';

    const optionTexts = Array.from(el.options || [])
      .map(o => (o.textContent || o.value || '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12);

    const hasMonthName = optionTexts.some(t => MONTH_NAMES.some(m => t.includes(m.slice(0, 3))));
    if (hasMonthName) return 'month';

    const hasYear = optionTexts.some(t => /\b\d{4}\b/.test(t));
    if (hasYear) return 'year';

    return 'combined';
  }

  function setDateSelectValue(el, dateValue, part) {
    const parsed = parseDateParts(dateValue);
    if (!parsed) return false;

    const mm = String(parsed.month).padStart(2, '0');
    const m = String(parsed.month);
    const monthShort = MONTH_NAMES[parsed.month - 1].slice(0, 3);
    const monthLong = MONTH_NAMES[parsed.month - 1];
    const yyyy = String(parsed.year);

    if (part === 'month') {
      const targets = [mm, m, monthShort, monthLong].filter(Boolean);
      return targets.some(target => setSelectValue(el, target));
    }

    if (part === 'year') {
      return setSelectValue(el, yyyy);
    }

    const combinedTargets = [
      `${mm}/${yyyy}`,
      `${yyyy}-${mm}`,
      `${monthShort} ${yyyy}`,
      `${monthLong} ${yyyy}`,
      `${monthLong}, ${yyyy}`,
      `${monthShort}, ${yyyy}`,
      `${monthLong}-${yyyy}`,
      `${monthShort}-${yyyy}`,
    ];

    return combinedTargets.some(target => setSelectValue(el, target));
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

    // ── 1. Text/date inputs and textareas ────────────────
    const textEls = document.querySelectorAll(
      'input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="date"], input[type="month"], input[type="datetime-local"], textarea'
    );

    textEls.forEach(el => {
      if (el.disabled || el.readOnly) return;
      
      const labels = getElementLabels(el);

      // Workday/Greenhouse often expose stable field identity in attrs rather than visible labels.
      const inferredField = detectFieldFromAttributes(el);
      if (inferredField && profile[inferredField]) {
        let value = profile[inferredField];
        if (inferredField === 'email' && profile.firstName && profile.lastName) {
          const emailInfo = detectEmailFormat();
          if (emailInfo?.detectedFormat) {
            value = generateEmailFromFormat(profile.firstName, profile.lastName, emailInfo.detectedFormat, emailInfo.domain) || value;
          }
        }
        setInputValue(el, normalizeValueForElement(el, value, inferredField), { isDateLike: isDateFieldName(inferredField) });
        filled++;
        return;
      }

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
            setInputValue(el, normalizeValueForElement(el, value, field), { isDateLike: isDateFieldName(field) });
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
        if (el.disabled) return;

        const labels = getElementLabels(el);
        const inferredField = detectFieldFromAttributes(el);

        let matchedField = null;
        for (const [field, patterns] of workLabels.entries()) {
          if (matchesPattern(labels, patterns)) {
            matchedField = field;
            break;
          }
        }

        if (!matchedField && inferredField && workLabels.has(inferredField)) {
          matchedField = inferredField;
        }

        if (matchedField) {
          workFieldEls.get(matchedField).push(el);
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
            setInputValue(el, normalizeValueForElement(el, value, field), { isDateLike: isDateFieldName(field) });
            filled++;
          }
        });
      });

      // Fill work experience date dropdowns (common in Workday)
      const workDateSelectEls = {
        startDate: { month: [], year: [], combined: [] },
        endDate: { month: [], year: [], combined: [] },
      };

      document.querySelectorAll('select').forEach(el => {
        if (el.disabled) return;

        const labels = getElementLabels(el);
        const inferredField = detectFieldFromAttributes(el);

        let matchedField = null;
        for (const [field, patterns] of workLabels.entries()) {
          if (field !== 'startDate' && field !== 'endDate') continue;
          if (matchesPattern(labels, patterns)) {
            matchedField = field;
            break;
          }
        }

        if (!matchedField && (inferredField === 'startDate' || inferredField === 'endDate')) {
          matchedField = inferredField;
        }

        if (!matchedField) return;

        const part = getDateSelectPart(el, labels);
        workDateSelectEls[matchedField][part].push(el);
      });

      ['startDate', 'endDate'].forEach((field) => {
        ['month', 'year', 'combined'].forEach((part) => {
          workDateSelectEls[field][part].forEach((el, index) => {
            const job = workExperience[index];
            if (!job || !job[field]) return;
            if (setDateSelectValue(el, job[field], part)) {
              filled++;
            }
          });
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

    let selectedDomain = domain;
    Array.from(emails).forEach(email => {
      const [localPart, domainPart] = email.split('@');
      
      // Only count emails from current domain
      if (!domainPart.includes(domain.split('.')[0])) return;
      selectedDomain = domainPart;

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
      domain: selectedDomain || domain,
      emailCount: emails.size,
      examples: Array.from(emails).slice(0, 3),
      rawDomain: domain
    };
  }

  function extractJobDescription() {
    const selectors = [
      '[data-automation-id*="jobPosting"]',
      '[data-automation-id*="jobDescription"]',
      '[class*="job-description"]',
      '[id*="job-description"]',
      '[class*="description"]',
      'article',
      'main',
    ];

    const scoreTextBlock = (el) => {
      const text = (el && el.innerText ? el.innerText : '').replace(/\s+/g, ' ').trim();
      if (!text) return { text: '', score: 0 };

      const keywordHits = [
        'responsibilities', 'requirements', 'qualifications', 'about the role',
        'what you will do', 'what we are looking for', 'preferred', 'experience',
      ].reduce((count, key) => count + (text.toLowerCase().includes(key) ? 1 : 0), 0);

      return {
        text,
        score: Math.min(text.length, 12000) + keywordHits * 1200,
      };
    };

    let best = { text: '', score: 0, source: 'body' };

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        const candidate = scoreTextBlock(el);
        if (candidate.score > best.score) {
          best = { ...candidate, source: selector };
        }
      });
    });

    if (!best.text || best.text.length < 120) {
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      best = {
        text: bodyText,
        score: bodyText.length,
        source: 'body',
      };
    }

    return {
      jobDescription: (best.text || '').slice(0, 16000),
      source: best.source,
      url: window.location.href,
    };
  }

  // ── Retry pass for dynamic job app UIs ─────────────────
  function autofillWithRetries(profile, workExperience = [], retries = 3, delayMs = 700) {
    return new Promise((resolve) => {
      let best = { filled: 0, fileHighlights: 0 };
      let attempt = 0;

      const run = () => {
        const result = autofill(profile, workExperience);
        if ((result.filled + result.fileHighlights) > (best.filled + best.fileHighlights)) {
          best = result;
        }

        attempt += 1;
        const done = attempt > retries;
        if (done) {
          resolve(best);
          return;
        }

        setTimeout(run, delayMs);
      };

      run();
    });
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


  // ── Listen for messages from the popup ──────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'autofill') {
      // Get work experience from storage
      chrome.storage.local.get('workExperience', (result) => {
        const workExperience = result.workExperience || [];
        autofillWithRetries(message.profile, workExperience).then((resultObj) => {
          sendResponse(resultObj);
        });
      });
      return true; // Will respond asynchronously
    } else if (message.action === 'detectEmail') {
      const emailInfo = detectEmailFormat();
      sendResponse(emailInfo);
    } else if (message.action === 'extractJobDescription') {
      sendResponse(extractJobDescription());
    }
    return true;
  });

})();
