// KYUM CRM — Unified Geographic Address Component
(function () {
  "use strict";

  const GEO_CACHE_KEY = "geography:canonical-catalog:v3";
  const GEO_CACHE_SCHEMA_VERSION = 3;
  const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const GEO_CACHE_STALE_MAX_MS = 365 * 24 * 60 * 60 * 1000;

  let catalog = { regions: [], cities: [], districts: [] };
  let catalogPromise = null;
  let networkRefreshPromise = null;
  let lastLoadStatus = { source: "empty", stale: false, updatedAt: null };
  let searchIndex = { region: new Map(), city: new Map(), district: new Map() };
  let relationIndex = {
    regionById: new Map(),
    cityById: new Map(),
    districtById: new Map(),
    citiesByRegion: new Map(),
    districtsByCity: new Map()
  };

  function normalizeValue(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function effectiveLanguage() {
    return window.PetatoeLocalization?.effectiveLanguage?.() === "en" ? "en" : "ar";
  }

  function localizedName(row) {
    if (!row) return "";
    const ar = normalizeValue(row.name);
    const en = normalizeValue(row.name_en || row.nameEn);
    return effectiveLanguage() === "en" && en ? en : ar;
  }

  function localizedDistrictLabel(id = "", fallbackName = "") {
    const normalizedId = normalizeValue(id);
    const normalizedFallback = normalizeValue(fallbackName);
    const row = (normalizedId ? relationIndex.districtById.get(String(normalizedId)) : null)
      || (normalizedFallback ? findByName("district", normalizedFallback) : null)
      || null;
    const lang = effectiveLanguage();

    if (!row) {
      if (lang !== "en") return normalizedFallback;
      if (normalizedId) {
        const translated = window.PetatoeLocalization?.entityText?.("neighborhood", {
          id: normalizedId,
          name: normalizedFallback
        });
        if (translated && !(/^\[entity\.neighborhood\./).test(translated) && !(/[\u0600-\u06FF]/).test(translated)) {
          return translated;
        }
      }
      const translatedByName = window.PetatoeLocalization?.getRows?.().find?.(item =>
        String(item?.key || "").startsWith("entity.neighborhood.")
        && normalizeSearch(item?.ar) === normalizeSearch(normalizedFallback)
        && normalizeValue(item?.en)
        && !(/[\u0600-\u06FF]/).test(String(item.en))
      );
      return normalizeValue(translatedByName?.en);
    }

    const sourceName = normalizeValue(row.name || normalizedFallback);
    const sourceEnglish = normalizeValue(row.name_en || row.nameEn);
    if (lang !== "en") return sourceName || normalizedFallback;
    if (sourceEnglish && !(/[\u0600-\u06FF]/).test(sourceEnglish)) return sourceEnglish;

    const translated = window.PetatoeLocalization?.entityText?.("neighborhood", {
      id: row.id || normalizedId,
      name: sourceName || normalizedFallback,
      en: sourceEnglish,
      name_en: sourceEnglish
    });
    if (translated && !(/^\[entity\.neighborhood\./).test(translated) && !(/[\u0600-\u06FF]/).test(translated)) {
      return translated;
    }
    const translatedByName = window.PetatoeLocalization?.getRows?.().find?.(item =>
      String(item?.key || "").startsWith("entity.neighborhood.")
      && normalizeSearch(item?.ar) === normalizeSearch(sourceName || normalizedFallback)
      && normalizeValue(item?.en)
      && !(/[\u0600-\u06FF]/).test(String(item.en))
    );
    return normalizeValue(translatedByName?.en);
  }

  function geoT(key, fallback) {
    const value = window.PetatoeLocalization?.t?.(key);
    return value && !/^\[.+\]$/.test(value) ? value : fallback;
  }

  function normalizeSearch(value) {
    return normalizeValue(value)
      .normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/ـ/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[،,;؛:._\-–—/\\()\[\]{}]+/g, " ")
      .replace(/^(?:ال)?منطقه\s+/g, "")
      .replace(/^حي\s+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function tokenizeSearch(value) {
    return normalizeSearch(value).split(" ").filter(Boolean);
  }

  function buildIndexes() {
    const buildSearch = rows => new Map(rows.map(row => {
      const searchable = `${normalizeValue(row.name)} ${normalizeValue(row.name_en || row.nameEn)}`.trim();
      return [String(row.id), {
        key: normalizeSearch(searchable),
        tokens: tokenizeSearch(searchable)
      }];
    }));
    const groupBy = (rows, field) => {
      const result = new Map();
      rows.forEach(row => {
        const key = String(row?.[field] || "");
        if (!key) return;
        if (!result.has(key)) result.set(key, []);
        result.get(key).push(row);
      });
      return result;
    };

    searchIndex = {
      region: buildSearch(catalog.regions),
      city: buildSearch(catalog.cities),
      district: buildSearch(catalog.districts)
    };
    relationIndex = {
      regionById: new Map(catalog.regions.map(row => [String(row.id), row])),
      cityById: new Map(catalog.cities.map(row => [String(row.id), row])),
      districtById: new Map(catalog.districts.map(row => [String(row.id), row])),
      citiesByRegion: groupBy(catalog.cities, "region_id"),
      districtsByCity: groupBy(catalog.districts, "city_id")
    };
    return { searchIndex, relationIndex };
  }

  function hasCompleteCatalog(value = catalog) {
    return Boolean(
      Array.isArray(value?.regions) && value.regions.length
      && Array.isArray(value?.cities) && value.cities.length
      && Array.isArray(value?.districts) && value.districts.length
    );
  }

  function applyCatalog(next = {}, source = "runtime") {
    catalog = {
      regions: Array.isArray(next.regions) ? next.regions.filter(row => row?.is_active !== false) : [],
      cities: Array.isArray(next.cities) ? next.cities.filter(row => row?.is_active !== false) : [],
      districts: Array.isArray(next.districts || next.neighborhoods)
        ? (next.districts || next.neighborhoods).filter(row => row?.is_active !== false)
        : []
    };
    buildIndexes();
    lastLoadStatus = { ...lastLoadStatus, source };
    return catalog;
  }

  function scoreSearch(type, row, query) {
    const q = normalizeSearch(query);
    if (!q) return 0;
    const searchable = `${normalizeValue(row.name)} ${normalizeValue(row.name_en || row.nameEn)}`.trim();
    const meta = searchIndex[type]?.get(String(row.id)) || { key: normalizeSearch(searchable), tokens: tokenizeSearch(searchable) };
    if (meta.key === q) return 1000;
    if (meta.key.startsWith(q)) return 800;
    const queryTokens = tokenizeSearch(q);
    if (queryTokens.length && queryTokens.every(token => meta.tokens.some(item => item.startsWith(token)))) return 650;
    if (meta.key.includes(q)) return 500;
    if (queryTokens.length && queryTokens.every(token => meta.key.includes(token))) return 350;
    return -1;
  }

  async function fetchAll(table, columns) {
    if (!window.customerSupabase) throw new Error(geoT("geography.error.supabaseNotReady", "Supabase connection is not ready."));
    const rows = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await window.customerSupabase
        .from(table)
        .select(columns)
        .eq("is_active", true)
        .order("name")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const batch = Array.isArray(data) ? data : [];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }

  async function currentNamespace() {
    const localId = window.KYUMOfflineSessionStore?.currentUserId?.();
    if (localId) return `user:${localId}`;
    try {
      const result = await window.customerSupabase?.auth?.getUser?.();
      return `user:${result?.data?.user?.id || "anonymous"}`;
    } catch (_) {
      return "user:anonymous";
    }
  }

  async function readPersistentCatalog(namespace) {
    if (!window.KYUMSmartCache) return null;
    const cached = await window.KYUMSmartCache.get(GEO_CACHE_KEY, {
      namespace,
      allowStale: true,
      allowStaleAnyAge: true,
      staleMaxMs: GEO_CACHE_STALE_MAX_MS
    });
    return cached?.hit && hasCompleteCatalog(cached.data) ? cached : null;
  }

  async function persistCatalog(data, namespace) {
    if (!window.KYUMSmartCache || !hasCompleteCatalog(data)) return null;
    return window.KYUMSmartCache.set(GEO_CACHE_KEY, data, {
      namespace,
      ttlMs: GEO_CACHE_TTL_MS,
      staleMaxMs: GEO_CACHE_STALE_MAX_MS,
      source: "supabase",
      schemaVersion: GEO_CACHE_SCHEMA_VERSION
    });
  }

  async function refreshCatalogFromNetwork(namespace, previousData = null) {
    if (networkRefreshPromise) return networkRefreshPromise;
    networkRefreshPromise = (async () => {
      const [regions, cities, districts] = await Promise.all([
        fetchAll("installation_regions", "id,name,name_en,is_active"),
        fetchAll("installation_cities", "id,region_id,name,name_en,is_active"),
        fetchAll("installation_neighborhoods", "id,region_id,city_id,name,name_en,city,region,is_active")
      ]);
      const next = { regions, cities, districts };
      applyCatalog(next, "network");
      const persisted = await persistCatalog(next, namespace);
      lastLoadStatus = { source: "network", stale: false, updatedAt: persisted?.updatedAt || Date.now() };
      if (previousData && window.KYUMSmartCache?.hashValue(previousData) !== window.KYUMSmartCache?.hashValue(next)) {
        window.dispatchEvent(new CustomEvent("kyum-geography-cache-updated", {
          detail: { catalog: next, source: "network-refresh", updatedAt: Date.now() }
        }));
      }
      return catalog;
    })().finally(() => {
      networkRefreshPromise = null;
    });
    return networkRefreshPromise;
  }

  async function loadCatalog(force = false) {
    if (!force && hasCompleteCatalog()) return catalog;
    if (catalogPromise) return catalogPromise;

    catalogPromise = (async () => {
      const namespace = await currentNamespace();
      let persistent = null;

      if (!force) {
        persistent = await readPersistentCatalog(namespace);
        if (persistent) {
          applyCatalog(persistent.data, "persistent-cache");
          lastLoadStatus = {
            source: "persistent-cache",
            stale: Boolean(persistent.stale),
            updatedAt: persistent.metadata?.updatedAt || null
          };
          if (window.customerSupabase && navigator.onLine !== false) {
            refreshCatalogFromNetwork(namespace, persistent.data).catch(error => {
              console.warn("KYUM Geography background refresh skipped:", error);
            });
          }
          return catalog;
        }
      }

      try {
        return await refreshCatalogFromNetwork(namespace);
      } catch (error) {
        persistent = persistent || await readPersistentCatalog(namespace);
        if (persistent) {
          applyCatalog(persistent.data, "persistent-cache-fallback");
          lastLoadStatus = {
            source: "persistent-cache-fallback",
            stale: true,
            updatedAt: persistent.metadata?.updatedAt || null
          };
          return catalog;
        }
        if (hasCompleteCatalog()) return catalog;
        throw error;
      }
    })().finally(() => {
      catalogPromise = null;
    });

    return catalogPromise;
  }

  function setCatalog(next = {}) {
    const merged = {
      regions: Array.isArray(next.regions) ? next.regions : catalog.regions,
      cities: Array.isArray(next.cities) ? next.cities : catalog.cities,
      districts: Array.isArray(next.districts || next.neighborhoods)
        ? (next.districts || next.neighborhoods)
        : catalog.districts
    };
    return applyCatalog(merged, "runtime-sync");
  }

  function getCacheStatus() {
    return {
      ...lastLoadStatus,
      inMemory: hasCompleteCatalog(),
      regions: catalog.regions.length,
      cities: catalog.cities.length,
      districts: catalog.districts.length,
      networkRefreshInFlight: Boolean(networkRefreshPromise)
    };
  }

  function getCatalog() {
    return catalog;
  }

  function findByName(type, name, parentId = "") {
    const normalized = normalizeSearch(name);
    if (!normalized) return null;
    const rows = type === "region" ? catalog.regions : type === "city" ? catalog.cities : catalog.districts;
    return rows.find(row => {
      if (![row.name, row.name_en, row.nameEn].some(value => normalizeSearch(value) === normalized)) return false;
      if (!parentId) return true;
      return String(type === "city" ? row.region_id : row.city_id) === String(parentId);
    }) || null;
  }

  function canonicalizeAddress(address = {}) {
    const requestedRegionId = normalizeValue(address.regionId);
    const requestedCityId = normalizeValue(address.cityId);
    const requestedDistrictId = normalizeValue(address.districtId);
    let region = requestedRegionId
      ? relationIndex.regionById.get(String(requestedRegionId)) || null
      : findByName("region", address.region);
    let city = requestedCityId
      ? relationIndex.cityById.get(String(requestedCityId)) || null
      : findByName("city", address.city, region?.id || "");
    let district = requestedDistrictId
      ? relationIndex.districtById.get(String(requestedDistrictId)) || null
      : findByName("district", address.district, city?.id || "");

    const requestedMissing = {
      region: Boolean(requestedRegionId && !region),
      city: Boolean(requestedCityId && !city),
      district: Boolean(requestedDistrictId && !district)
    };
    const cityRegionMismatch = Boolean(city && region && String(city.region_id) !== String(region.id));
    const districtCityMismatch = Boolean(district && city && String(district.city_id) !== String(city.id));
    const districtRegionMismatch = Boolean(district && region && district.region_id && String(district.region_id) !== String(region.id));

    // Infer missing parents only when the child itself resolves to an active canonical row.
    if (!city && district && !requestedCityId) city = relationIndex.cityById.get(String(district.city_id)) || null;
    if (!region && city && !requestedRegionId) region = relationIndex.regionById.get(String(city.region_id)) || null;

    const validRegionCity = Boolean(region && city && String(city.region_id) === String(region.id));
    const validDistrictCity = Boolean(city && district && String(district.city_id) === String(city.id));
    const validDistrictRegion = Boolean(!district?.region_id || (region && String(district.region_id) === String(region.id)));

    return {
      regionId: region?.id || "",
      region: region?.name || normalizeValue(address.region),
      cityId: city?.id || "",
      city: city?.name || normalizeValue(address.city),
      districtId: district?.id || "",
      district: district?.name || normalizeValue(address.district),
      complete: Boolean(region && city && district && validRegionCity && validDistrictCity && validDistrictRegion),
      validRegionCity,
      validDistrictCity,
      validDistrictRegion,
      requestedMissing,
      cityRegionMismatch,
      districtCityMismatch,
      districtRegionMismatch
    };
  }

  function validateCanonicalAddress(address = {}, { requireRegion = true, requireCity = true, requireDistrict = true } = {}) {
    const current = canonicalizeAddress(address);
    if (current.requestedMissing.region) return { valid: false, field: "region", code: "REGION_NOT_ACTIVE", message: geoT("geography.validation.regionNotActive", "The selected region does not exist or is inactive.") };
    if (current.requestedMissing.city) return { valid: false, field: "city", code: "CITY_NOT_ACTIVE", message: geoT("geography.validation.cityNotActive", "The selected city does not exist or is inactive.") };
    if (current.requestedMissing.district) return { valid: false, field: "district", code: "DISTRICT_NOT_ACTIVE", message: geoT("geography.validation.districtNotActive", "The selected neighborhood does not exist or is inactive.") };
    if (requireRegion && !current.regionId) return { valid: false, field: "region", code: "REGION_REQUIRED", message: geoT("geography.validation.regionRequired", "Select a region.") };
    if (requireCity && !current.cityId) return { valid: false, field: "city", code: "CITY_REQUIRED", message: geoT("geography.validation.cityRequired", "Select a city.") };
    if (requireDistrict && !current.districtId) return { valid: false, field: "district", code: "DISTRICT_REQUIRED", message: geoT("geography.validation.districtRequired", "Select a neighborhood.") };
    if (current.cityRegionMismatch || (current.cityId && !current.validRegionCity)) return { valid: false, field: "city", code: "CITY_REGION_MISMATCH", message: geoT("geography.validation.cityRegionMismatch", "The city does not belong to the selected region.") };
    if (current.districtCityMismatch || (current.districtId && !current.validDistrictCity)) return { valid: false, field: "district", code: "DISTRICT_CITY_MISMATCH", message: geoT("geography.validation.districtCityMismatch", "The neighborhood does not belong to the selected city.") };
    if (current.districtRegionMismatch || (current.districtId && !current.validDistrictRegion)) return { valid: false, field: "district", code: "DISTRICT_REGION_MISMATCH", message: geoT("geography.validation.districtRegionMismatch", "The neighborhood does not belong to the selected region.") };
    return { valid: true, value: current };
  }

  function createController(config) {
    const documentRef = config.document || document;
    const ids = config.ids;
    const optionLimit = Number(config.optionLimit || 300);
    const boundAttr = config.boundAttribute || "geoUnifiedBound";

    const elements = type => {
      const item = ids[type] || {};
      return {
        wrapper: documentRef.getElementById(item.wrapper),
        hidden: documentRef.getElementById(item.hidden),
        search: documentRef.getElementById(item.search),
        options: documentRef.getElementById(item.options)
      };
    };

    const rowsFor = type => {
      const regionId = elements("region").hidden?.value || "";
      const cityId = elements("city").hidden?.value || "";
      if (type === "region") return catalog.regions;
      if (type === "city") return regionId ? (relationIndex.citiesByRegion.get(String(regionId)) || []) : [];
      return cityId ? (relationIndex.districtsByCity.get(String(cityId)) || []) : [];
    };

    const close = type => {
      const { wrapper, search, options } = elements(type);
      if (!wrapper || !search || !options) return;
      wrapper.dataset.open = "false";
      search.setAttribute("aria-expanded", "false");
      search.removeAttribute("aria-activedescendant");
      options.classList.add("hidden");
      config.onClose?.(type, { wrapper, search, options });
    };

    const closeAll = except => ["region", "city", "district"].forEach(type => type !== except && close(type));

    const setEnabled = (type, enabled, placeholder) => {
      const { wrapper, search } = elements(type);
      if (!wrapper || !search) return;
      search.disabled = !enabled;
      wrapper.classList.toggle("is-disabled", !enabled);
      wrapper.querySelector(".geo-searchable-toggle")?.toggleAttribute("disabled", !enabled);
      if (placeholder) search.placeholder = placeholder;
    };

    const render = (type, query = "") => {
      const { hidden, options } = elements(type);
      if (!options) return;
      const q = normalizeSearch(query);
      const rows = rowsFor(type)
        .map(row => ({ row, score: q ? scoreSearch(type, row, q) : 0 }))
        .filter(item => !q || item.score >= 0)
        .sort((a, b) => b.score - a.score || localizedName(a.row).localeCompare(localizedName(b.row), effectiveLanguage() === "en" ? "en" : "ar"))
        .slice(0, optionLimit)
        .map(item => item.row);
      options.replaceChildren();
      if (!rows.length) {
        const empty = documentRef.createElement("div");
        empty.className = "geo-searchable-empty";
        empty.textContent = geoT("geography.search.noResults", "لا توجد نتائج مطابقة.");
        options.appendChild(empty);
        return;
      }
      rows.forEach(row => {
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = `geo-searchable-option${String(hidden?.value || "") === String(row.id) ? " is-selected" : ""}`;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(String(hidden?.value || "") === String(row.id)));
        button.id = `geo-option-${type}-${String(row.id)}`;
        button.dataset.geoUnifiedId = String(row.id);
        button.textContent = localizedName(row);
        options.appendChild(button);
      });
    };

    const open = type => {
      const { wrapper, search, options } = elements(type);
      if (!wrapper || !search || !options || search.disabled) return;
      closeAll(type);
      render(type, search.value);
      wrapper.dataset.open = "true";
      search.setAttribute("aria-expanded", "true");
      options.classList.remove("hidden");
      const selected = options.querySelector(".geo-searchable-option.is-selected");
      if (selected) selected.scrollIntoView?.({ block: "nearest" });
      config.onOpen?.(type, { wrapper, search, options });
    };

    const select = (type, id, options = {}) => {
      const { cascade = true, closeAfter = true } = options;
      const { hidden, search } = elements(type);
      if (!hidden || !search) return null;
      const index = type === "region" ? relationIndex.regionById : type === "city" ? relationIndex.cityById : relationIndex.districtById;
      const row = index.get(String(id || "")) || null;
      hidden.value = row ? String(row.id) : "";
      search.value = row ? localizedName(row) : "";
      search.dataset.selectedId = row ? String(row.id) : "";
      search.setCustomValidity("");
      if (type === "region" && cascade) {
        select("city", "", { cascade: false, closeAfter: false });
        select("district", "", { cascade: false, closeAfter: false });
        setEnabled("city", Boolean(row), row ? geoT("geography.placeholder.citySearch", "ابحث واختر المدينة") : geoT("geography.placeholder.regionFirst", "اختر المنطقة أولًا"));
        setEnabled("district", false, geoT("geography.placeholder.cityFirst", "اختر المدينة أولًا"));
      }
      if (type === "city" && cascade) {
        select("district", "", { cascade: false, closeAfter: false });
        setEnabled("district", Boolean(row), row ? geoT("geography.placeholder.districtSearch", "ابحث واختر الحي") : geoT("geography.placeholder.cityFirst", "اختر المدينة أولًا"));
      }
      if (closeAfter) close(type);
      config.onChange?.(type, row, value());
      return row;
    };

    const value = () => {
      const regionId = elements("region").hidden?.value || "";
      const cityId = elements("city").hidden?.value || "";
      const districtId = elements("district").hidden?.value || "";
      return canonicalizeAddress({ regionId, cityId, districtId });
    };

    const setValue = current => {
      const resolved = canonicalizeAddress(current || {});
      select("region", resolved.regionId, { cascade: true, closeAfter: false });
      select("city", resolved.cityId, { cascade: true, closeAfter: false });
      select("district", resolved.districtId, { cascade: false, closeAfter: false });
      setEnabled("city", Boolean(resolved.regionId), resolved.regionId ? geoT("geography.placeholder.citySearch", "ابحث واختر المدينة") : geoT("geography.placeholder.regionFirst", "اختر المنطقة أولًا"));
      setEnabled("district", Boolean(resolved.cityId), resolved.cityId ? geoT("geography.placeholder.districtSearch", "ابحث واختر الحي") : geoT("geography.placeholder.cityFirst", "اختر المدينة أولًا"));
      return resolved;
    };

    const validate = ({ requireRegion = true, requireCity = true, requireDistrict = true } = {}) =>
      validateCanonicalAddress({
        regionId: elements("region").hidden?.value || "",
        cityId: elements("city").hidden?.value || "",
        districtId: elements("district").hidden?.value || ""
      }, { requireRegion, requireCity, requireDistrict });

    const bind = () => {
      ["region", "city", "district"].forEach(type => {
        const { wrapper, hidden, search, options } = elements(type);
        if (!wrapper || !hidden || !search || !options || wrapper.dataset[boundAttr]) return;
        wrapper.dataset[boundAttr] = "1";
        search.addEventListener("focus", () => open(type));
        search.addEventListener("input", () => {
          hidden.value = "";
          search.dataset.selectedId = "";
          if (type === "region") {
            select("city", "", { cascade: false, closeAfter: false });
            select("district", "", { cascade: false, closeAfter: false });
            setEnabled("city", false, geoT("geography.placeholder.regionFirst", "اختر المنطقة أولًا"));
            setEnabled("district", false, geoT("geography.placeholder.cityFirst", "اختر المدينة أولًا"));
          } else if (type === "city") {
            select("district", "", { cascade: false, closeAfter: false });
            setEnabled("district", false, geoT("geography.placeholder.cityFirst", "اختر المدينة أولًا"));
          }
          render(type, search.value);
          open(type);
        });
        search.addEventListener("keydown", event => {
          if (event.key === "Escape") { event.preventDefault(); close(type); return; }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            open(type);
            const buttons = [...options.querySelectorAll(".geo-searchable-option")];
            if (!buttons.length) return;
            const target = event.key === "End" || event.key === "ArrowUp" ? buttons[buttons.length - 1] : buttons[0];
            target.focus();
            search.setAttribute("aria-activedescendant", target.id);
            return;
          }
          if (event.key === "Enter" && wrapper.dataset.open === "true") {
            const first = options.querySelector(".geo-searchable-option");
            if (first) { event.preventDefault(); select(type, first.dataset.geoUnifiedId); }
          }
        });
        wrapper.querySelector(".geo-searchable-toggle")?.addEventListener("click", () => wrapper.dataset.open === "true" ? close(type) : open(type));
        options.addEventListener("click", event => {
          const button = event.target.closest(".geo-searchable-option");
          if (button) select(type, button.dataset.geoUnifiedId);
        });
        options.addEventListener("keydown", event => {
          const current = event.target.closest(".geo-searchable-option");
          if (!current) return;
          const buttons = [...options.querySelectorAll(".geo-searchable-option")];
          const index = buttons.indexOf(current);
          let target = null;
          if (event.key === "ArrowDown") target = buttons[Math.min(index + 1, buttons.length - 1)];
          if (event.key === "ArrowUp") target = index > 0 ? buttons[index - 1] : search;
          if (event.key === "Home") target = buttons[0];
          if (event.key === "End") target = buttons[buttons.length - 1];
          if (target) {
            event.preventDefault();
            target.focus();
            if (target.id) search.setAttribute("aria-activedescendant", target.id);
            else search.removeAttribute("aria-activedescendant");
          }
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(type, current.dataset.geoUnifiedId); }
          if (event.key === "Escape") { event.preventDefault(); close(type); search.focus(); }
        });
        options.addEventListener("focusin", event => {
          const current = event.target.closest(".geo-searchable-option");
          if (current?.id) search.setAttribute("aria-activedescendant", current.id);
        });
      });
      documentRef.addEventListener("click", event => {
        if (!event.target.closest(".geo-searchable-select") && !event.target.closest(".geo-searchable-options")) closeAll();
      });
      return api;
    };

    const refreshLanguage = () => {
      const current = value();
      setValue(current);
      ["region", "city", "district"].forEach(type => {
        const { wrapper, search } = elements(type);
        if (wrapper?.dataset.open === "true") render(type, search?.value || "");
      });
    };
    window.addEventListener("petatoe-language-changed", refreshLanguage);
    window.addEventListener("petatoe-localization-updated", refreshLanguage);

    const api = Object.freeze({ bind, open, close, select, setValue, value, validate, setEnabled, render, elements, refreshLanguage });
    return api;
  }

  window.KYUMGeography = Object.freeze({
    normalizeValue,
    localizedName,
    localizedDistrictLabel,
    normalizeSearch,
    tokenizeSearch,
    scoreSearch,
    loadCatalog,
    setCatalog,
    getCatalog,
    getCacheStatus,
    findByName,
    canonicalizeAddress,
    validateCanonicalAddress,
    createController
  });
})();
