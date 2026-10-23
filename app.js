"use strict";

const $ = (id) => document.getElementById(id);
const API_URL = String(window.AEROATLAS_API_URL || "").trim();
const ACTIVITY = {
  Walking: { temp: 21, wind: 25 }, Running: { temp: 18, wind: 24 }, Cycling: { temp: 19, wind: 18 },
  Hiking: { temp: 18, wind: 24 }, Cricket: { temp: 23, wind: 20 }, "Outdoor football": { temp: 19, wind: 20 },
  "Outdoor tennis": { temp: 20, wind: 19 }, Yoga: { temp: 21, wind: 12 }, Picnic: { temp: 23, wind: 15 },
  Photography: { temp: 20, wind: 22 }, "Outdoor event": { temp: 21, wind: 15 }
};
const ALIASES = { walk: "Walking", walking: "Walking", run: "Running", running: "Running", cycle: "Cycling", cycling: "Cycling", hike: "Hiking", hiking: "Hiking", cricket: "Cricket", football: "Outdoor football", "outdoor football": "Outdoor football", tennis: "Outdoor tennis", "outdoor tennis": "Outdoor tennis", yoga: "Yoga", picnic: "Picnic", photography: "Photography", "outdoor event": "Outdoor event" };
let map;
let markers = [];
let currentEvidence = null;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function setStatus(message, error = false) {
  const box = $("status");
  box.textContent = message;
  box.className = error ? "status error" : "status";
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dx = (b.lon - a.lon) * rad * Math.cos((a.lat + b.lat) * rad / 2);
  const dy = (b.lat - a.lat) * rad;
  return 6371 * Math.hypot(dx, dy);
}
function compass(degrees) {
  if (degrees == null || Number.isNaN(Number(degrees))) return "direction unavailable";
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(Number(degrees) / 45) % 8];
}
function timeLabel(value) {
  const [hour, minute] = value.slice(11, 16).split(":").map(Number);
  const localClock = new Date();
  localClock.setHours(hour, minute, 0, 0);
  return localClock.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function score(hour, activities) {
  const perActivity = activities.map((name) => {
    const target = ACTIVITY[name];
    const t = Number(hour.temperature);
    const w = Number(hour.wind);
    const r = Number(hour.rain);
    const tempFit = Math.max(0, 100 - Math.abs(t - target.temp) * 4.5);
    const windFit = Math.max(0, 100 - Math.max(0, w - target.wind) * 4);
    const rainFit = Math.max(0, 100 - r * 0.9);
    return tempFit * 0.35 + windFit * 0.25 + rainFit * 0.4;
  });
  return Math.round(perActivity.reduce((a, b) => a + b, 0) / perActivity.length);
}
function canonicalActivities(primary, groupValue) {
  const names = [primary];
  if (groupValue.trim()) {
    groupValue.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean).forEach((name) => {
      const supported = ALIASES[name];
      if (!supported) throw new Error(`“${name}” is not in the activity list. Use activities such as walking, cycling, cricket, or yoga.`);
      names.push(supported);
    });
  }
  return [...new Set(names)];
}
function selectedPeriod(hour, period) {
  if (period === "morning") return hour >= 5 && hour <= 11;
  if (period === "afternoon") return hour >= 12 && hour <= 16;
  if (period === "evening") return hour >= 17 && hour <= 22;
  return true;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The data service took too long to respond. Please try again.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function getArea(query) {
  const terms = [query, ...query.split(",").map((part) => part.trim()).reverse()].filter((term, index, all) => term && all.indexOf(term) === index);
  for (const term of terms) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=en&format=json`;
    const response = await fetchWithTimeout(url, {}, 6000);
    if (!response.ok) throw new Error("Could not search for that area. Try a nearby city or locality.");
    const data = await response.json();
    if (data.results?.length) {
      const place = data.results[0];
      return { name: [place.name, place.admin1, place.country].filter(Boolean).slice(0, 3).join(", "), lat: place.latitude, lon: place.longitude };
    }
  }
  throw new Error("We couldn't find that area. Try a larger locality or city name.");
}
async function getPlaces(center, radius) {
  const query = `[out:json][timeout:8];(node["leisure"~"park|garden|nature_reserve|pitch|playground"](around:${radius},${center.lat},${center.lon});way["leisure"~"park|garden|nature_reserve|pitch|playground"](around:${radius},${center.lat},${center.lon});relation["leisure"~"park|garden|nature_reserve|pitch|playground"](around:${radius},${center.lat},${center.lon}););out center tags 35;`;
  let response;
  try {
    response = await fetchWithTimeout("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: `data=${encodeURIComponent(query)}` }, 8000);
  } catch {
    throw new Error("Nearby place data is temporarily unavailable.");
  }
  if (!response.ok) throw new Error("The OpenStreetMap place service is busy. Please try again shortly.");
  const data = await response.json();
  const seen = new Set();
  return (data.elements || []).map((item) => {
    const point = item.type === "node" ? item : item.center;
    const tags = item.tags || {};
    const name = tags.name || tags["name:en"];
    if (point?.lat == null || point?.lon == null || !name) return null;
    const key = `${name.toLowerCase()}|${Number(point.lat).toFixed(4)}|${Number(point.lon).toFixed(4)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return { name, lat: Number(point.lat), lon: Number(point.lon), type: tags.leisure || "outdoor place" };
  }).filter(Boolean).map((place) => ({ ...place, distance: distanceKm({ lat: center.lat, lon: center.lon }, place) }))
    .sort((a, b) => a.distance - b.distance).slice(0, 5);
}
async function getHourly(place) {
  const params = new URLSearchParams({ latitude: place.lat, longitude: place.lon, hourly: "temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m", forecast_days: "3", timezone: "auto" });
  const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, {}, 10000);
  if (!response.ok) throw new Error(`Could not load a forecast for ${place.name}.`);
  const data = await response.json();
  const hourly = data.hourly;
  if (!hourly?.time?.length) throw new Error(`No hourly forecast was returned for ${place.name}.`);
  return hourly.time.map((time, i) => ({ time, date: time.slice(0, 10), hour: Number(time.slice(11, 13)), temperature: hourly.temperature_2m[i], rain: hourly.precipitation_probability[i] ?? 0, wind: hourly.wind_speed_10m[i], direction: hourly.wind_direction_10m[i] }));
}
async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  }));
  return out;
}

function initializeMap() {
  if (map) return;
  map = L.map("map", { scrollWheelZoom: false }).setView([19.076, 72.8777], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
}
function drawMap(center, places, winner) {
  initializeMap();
  markers.forEach((marker) => marker.remove());
  markers = [];
  const bounds = [[center.lat, center.lon]];
  places.forEach((place) => {
    bounds.push([place.lat, place.lon]);
    const marker = L.marker([place.lat, place.lon]).addTo(map);
    marker.bindPopup(`<b>${escapeHtml(place.name)}</b><br>${place.name === winner ? "Top match for this plan" : `${place.distance.toFixed(1)} km from search area`}`);
    markers.push(marker);
  });
  const pin = L.circleMarker([center.lat, center.lon], { radius: 7, color: "#176c50", fillColor: "#176c50", fillOpacity: 1, weight: 2 }).addTo(map);
  pin.bindPopup(`<b>Starting area</b><br>${escapeHtml(center.name)}`);
  markers.push(pin);
  map.fitBounds(bounds, { padding: [25, 25], maxZoom: 14 });
  setTimeout(() => map.invalidateSize(), 120);
}
function render(result, center, places, activities) {
  const { hourlyWinners, candidates, date } = result;
  const best = candidates.slice().sort((a, b) => b.score - a.score)[0];
  const first = hourlyWinners[0];
  const last = hourlyWinners[hourlyWinners.length - 1];
  const shifted = first.place.name !== last.place.name;
  const alternative = candidates.find((option) => option.time !== best.time && option.place.name !== best.place.name) || candidates.find((option) => option.time !== best.time) || best;
  $("summary-title").textContent = `${activities.join(" + ")} near ${center.name}`;
  $("updated").textContent = `Forecast retrieved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  $("best-title").textContent = `${best.place.name} · ${timeLabel(best.time)}`;
  $("best-detail").textContent = `${activities.join(" + ")} match · ${best.temperature}°C · ${best.rain}% precipitation chance · wind ${best.wind} km/h from ${compass(best.direction)}. This score compares selected weather factors.`;
  $("score").textContent = best.score;
  $("windshift").innerHTML = shifted
    ? `The top match changes from <strong>${escapeHtml(first.place.name)}</strong> at ${timeLabel(first.time)} to <strong>${escapeHtml(last.place.name)}</strong> at ${timeLabel(last.time)} across the checked forecast hours. See the timeline for the conditions.`
    : `<strong>${escapeHtml(first.place.name)}</strong> stays top-scoring across the checked hours. The timeline shows how forecast conditions change.`;
  $("comfort").innerHTML = `The strongest available forecast match is <strong>${timeLabel(best.time)}</strong> for ${escapeHtml(best.place.name)} on ${new Date(`${date}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}: ${best.temperature}°C, ${best.rain}% precipitation chance, and ${best.wind} km/h wind.`;
  $("scenario").innerHTML = alternative === best
    ? `No distinct alternative hour was returned for this date and availability window. Try a different time window to compare another scenario.`
    : `What if you go at <strong>${timeLabel(alternative.time)}</strong>? The top comparison becomes ${escapeHtml(alternative.place.name)} (${alternative.score}/100), versus ${escapeHtml(best.place.name)} at ${timeLabel(best.time)} (${best.score}/100).`;
  $("groupfit").innerHTML = activities.length > 1
    ? `Shared comparison for <strong>${escapeHtml(activities.join(" and "))}</strong>. The score averages each activity's temperature, wind, and precipitation preferences.`
    : `Add two or more activities in Group Activities to compare a shared outing, for example <strong>walking, cricket</strong>.`;

  $("timeline").innerHTML = hourlyWinners.map((item, i) => {
    const bestHour = item.time === best.time;
    const placeShift = i > 0 && hourlyWinners[i - 1].place.name !== item.place.name;
    return `<article class="hour ${bestHour ? "best" : ""}"><div class="hour-time">${timeLabel(item.time)}</div><div class="hour-place">${escapeHtml(item.place.name)}</div><div class="hour-detail">${item.temperature}°C · Rain ${item.rain}%<br>Wind ${item.wind} km/h · ${compass(item.direction)}<br>Match ${item.score}/100</div>${bestHour ? '<span class="hour-tag">BEST WINDOW</span>' : (placeShift ? '<span class="hour-tag">PLACE CHANGES</span>' : "")}</article>`;
  }).join("");
  drawMap(center, places, best.place.name);
  currentEvidence = {
    location: center.name,
    activity: activities,
    selected: { place: best.place.name, time: best.time, temperatureC: best.temperature, precipitationChance: best.rain, windKmh: best.wind, windDirection: compass(best.direction), matchScore: best.score },
    comparisons: hourlyWinners.slice(0, 12).map((option) => ({ place: option.place.name, time: option.time, temperatureC: option.temperature, precipitationChance: option.rain, windKmh: option.wind, windDirection: compass(option.direction), matchScore: option.score }))
  };
  $("results").classList.remove("hidden");
}

async function plan(event) {
  event.preventDefault();
  $("results").classList.add("hidden");
  $("plan-button").disabled = true;
  $("plan-button").querySelector("span").textContent = "Checking forecast…";
  setStatus("Looking up the area, nearby outdoor places, and forecast hours…");
  try {
    const center = await getArea($("area").value.trim());
    let places;
    let placeWarning = false;
    try {
      places = await getPlaces(center, Number($("radius").value));
    } catch (error) {
      placeWarning = true;
      places = [{ name: `${center.name} (area forecast)`, lat: center.lat, lon: center.lon, type: "area forecast", distance: 0 }];
    }
    if (!places.length) throw new Error("No named outdoor places were found nearby. Try a larger search radius or another area.");
    const forecasts = await mapWithLimit(places, 3, async (place) => ({ place, hours: await getHourly(place) }));
    const activities = canonicalActivities($("activity").value, $("group").value);
    const date = $("date").value;
    const period = $("time-window").value;
    const candidates = [];
    forecasts.forEach(({ place, hours }) => hours.forEach((hour) => {
      if (hour.date === date && selectedPeriod(hour.hour, period)) {
        candidates.push({ place, time: hour.time, temperature: Math.round(hour.temperature), rain: Math.round(hour.rain), wind: Math.round(hour.wind), direction: hour.direction, score: score(hour, activities) });
      }
    }));
    if (!candidates.length) throw new Error("No forecast hours matched that date and time. Choose a date in the next two days or select Any time.");
    const times = [...new Set(candidates.map((option) => option.time))].sort();
    const hourlyWinners = times.map((time) => candidates.filter((option) => option.time === time).sort((a, b) => b.score - a.score)[0]);
    if (placeWarning) {
      setStatus("Nearby place data is temporarily unavailable, so this result compares forecast times for the selected area.");
      $("status").classList.remove("hidden");
    } else {
      setStatus("");
      $("status").classList.add("hidden");
    }
    render({ hourlyWinners, candidates, date }, center, places, activities);
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(error.message || "Could not complete the comparison. Please try again.", true);
    $("status").classList.remove("hidden");
  } finally {
    $("plan-button").disabled = false;
    $("plan-button").querySelector("span").textContent = "Find my plan";
  }
}

async function askAeroAtlas(event) {
  event.preventDefault();
  if (!currentEvidence) { $("ask-status").textContent = "Create a forecast comparison first, then ask about it."; return; }
  const question = $("question").value.trim();
  if (!question) return;
  const button = $("ask-button");
  const answer = $("answer");
  button.disabled = true;
  if (!API_URL) {
    $("ask-status").textContent = "Add your public AI API URL to config.js to connect Qwen3.";
    button.disabled = false;
    return;
  }
  $("ask-status").textContent = "Connecting to Qwen3…";
  answer.classList.add("hidden");
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context: currentEvidence })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || result.error || `AI server returned ${response.status}`);
    answer.textContent = result.answer;
    answer.classList.remove("hidden");
    $("ask-status").textContent = "Explanation generated from the forecast comparison above.";
    if ($("read-aloud").checked && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.answer));
    }
  } catch (error) {
    $("ask-status").textContent = error.message.includes("Failed to fetch")
      ? "Could not reach the AI server. Check the API URL and that your Mac and tunnel are running."
      : error.message;
  } finally { button.disabled = false; }
}

function enableVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { $("mic").disabled = true; $("mic").title = "Voice input is not supported in this browser"; return; }
  $("mic").addEventListener("click", () => {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    $("ask-status").textContent = "Listening…";
    recognition.onresult = (event) => { $("question").value = event.results[0][0].transcript; $("ask-status").textContent = "Question captured. Send it to ask Qwen3."; };
    recognition.onerror = () => { $("ask-status").textContent = "Voice input did not work. Type your question instead."; };
    recognition.start();
  });
}

function enableMotion() {
  const orbButton = $("orbit-toggle");
  const focusOptions = [
    { title: "Place × Time", detail: "Tap to explore the AeroAtlas features", label: "Place and Time" },
    { title: "Wind × Shift", detail: "See how changing conditions affect a place", label: "WindShift" },
    { title: "Plan × Group", detail: "Find a window that works for everyone", label: "GroupFit" }
  ];
  let focusIndex = 0;
  orbButton.addEventListener("click", () => {
    if (orbButton.dataset.skipClick === "true") {
      delete orbButton.dataset.skipClick;
      return;
    }
    focusIndex = (focusIndex + 1) % focusOptions.length;
    const focus = focusOptions[focusIndex];
    orbButton.querySelector(".hero-note-copy b").textContent = focus.title;
    orbButton.querySelector(".hero-note-copy small").textContent = focus.detail;
    orbButton.setAttribute("aria-label", `Change AeroAtlas focus: ${focus.label}. Drag the globe to rotate it`);
    orbButton.classList.remove("is-spinning");
    requestAnimationFrame(() => orbButton.classList.add("is-spinning"));
    window.setTimeout(() => orbButton.classList.remove("is-spinning"), 650);
  });
  orbButton.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || event.target.closest(".hero-orb")) return;
    const box = orbButton.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - .5;
    const y = (event.clientY - box.top) / box.height - .5;
    orbButton.style.transform = `perspective(700px) rotateX(${(-y * 14).toFixed(1)}deg) rotateY(${(x * 15).toFixed(1)}deg) translateY(-3px)`;
  });
  orbButton.addEventListener("pointerleave", () => { orbButton.style.transform = ""; });

  document.querySelectorAll(".feature").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5;
      const y = (event.clientY - box.top) / box.height - .5;
      card.style.transform = `perspective(800px) rotateX(${(-y * 10).toFixed(1)}deg) rotateY(${(x * 10).toFixed(1)}deg) translateY(-3px)`;
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
    card.addEventListener("pointerdown", () => {
      card.classList.add("is-pressed");
      window.setTimeout(() => card.classList.remove("is-pressed"), 420);
    });
  });
}

function enableAtmosphere() {
  const canvas = $("wind-canvas");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const particles = Array.from({ length: 48 }, (_, index) => ({
    t: Math.random(), lane: (index % 8) / 8, speed: .00016 + Math.random() * .00022,
    size: .7 + Math.random() * 1.8, phase: Math.random() * Math.PI * 2,
    violet: Math.random() > .64
  }));
  let width = 0;
  let height = 0;
  let pointerX = 0;
  let pointerY = 0;
  let frameId = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (reducedMotion) draw(0);
  };
  const draw = (time) => {
    context.clearRect(0, 0, width, height);
    const driftX = pointerX * 15;
    const driftY = pointerY * 11;
    for (let line = 0; line < 5; line++) {
      const y = height * (.18 + line * .14);
      const gradient = context.createLinearGradient(0, y, width, y + 40);
      gradient.addColorStop(0, "rgba(73,132,177,0)");
      gradient.addColorStop(.42, line === 2 ? "rgba(121,82,190,.22)" : "rgba(82,150,183,.18)");
      gradient.addColorStop(1, "rgba(73,132,177,0)");
      context.beginPath();
      context.moveTo(-10, y + driftY * .2);
      context.bezierCurveTo(width * .28, y - 28 + Math.sin(time * .00028 + line) * 14 + driftY, width * .68, y + 32 + Math.cos(time * .0002 + line) * 13 - driftY, width + 10, y - 8 + driftY * .24);
      context.strokeStyle = gradient;
      context.lineWidth = line === 2 ? 1.8 : 1.15;
      context.stroke();
    }
    particles.forEach((particle) => {
      if (!reducedMotion) particle.t = (particle.t + particle.speed * 16) % 1;
      const x = particle.t * width;
      const y = height * (.2 + particle.lane * .75) + Math.sin(particle.t * 7 + particle.phase + time * .0006) * 16 + driftY * (particle.lane - .5);
      const color = particle.violet ? "125,62,230" : "66,145,179";
      context.beginPath();
      context.arc(x + driftX * (particle.lane - .5), y, particle.size, 0, Math.PI * 2);
      context.fillStyle = `rgba(${color},${.12 + Math.sin(time * .001 + particle.phase) * .08})`;
      context.shadowBlur = 8;
      context.shadowColor = `rgba(${color},.28)`;
      context.fill();
      context.shadowBlur = 0;
    });
    if (!reducedMotion && !document.hidden) frameId = window.requestAnimationFrame(draw);
  };
  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width - .5)) * 2;
    pointerY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height - .5)) * 2;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.cancelAnimationFrame(frameId);
    else if (!reducedMotion) frameId = window.requestAnimationFrame(draw);
  });
  resize();
  if (!reducedMotion) frameId = window.requestAnimationFrame(draw);
}

$("date").value = todayISO();
$("date").min = todayISO();
$("plan-form").addEventListener("submit", plan);
$("ask-form").addEventListener("submit", askAeroAtlas);
enableVoice();
enableMotion();
enableAtmosphere();
