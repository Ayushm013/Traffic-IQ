var map = L.map('map', { zoomControl: false })
    .setView([28.6139, 77.2090], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
}).addTo(map);

L.control.zoom({ position: 'topright' }).addTo(map);

let sourceMarker = null;
let destMarker = null;
let routeLine = null;
let selectedMode = "faster";
let storedRoutes = [];

const CENTRAL_ZONE = {
    lat: 28.6328,
    lng: 77.2197,
    radius: 1500
};

document.getElementById("resetBtn").onclick = resetMap;
document.getElementById("refreshBtn").onclick = fetchRoute;
document.getElementById("fasterBtn").onclick = () => selectMode("faster");
document.getElementById("saferBtn").onclick = () => selectMode("safer");

map.on('click', function(e) {
    if (!sourceMarker) {
        sourceMarker = L.marker(e.latlng).addTo(map);
    } else if (!destMarker) {
        destMarker = L.marker(e.latlng).addTo(map);
        fetchRoute();
    }
});

async function fetchRoute() {

    let src = sourceMarker.getLatLng();
    let dst = destMarker.getLatLng();

    let url = `https://router.project-osrm.org/route/v1/driving/${src.lng},${src.lat};${dst.lng},${dst.lat}?overview=full&geometries=geojson&alternatives=true`;

    let res = await fetch(url);
    let data = await res.json();

    storedRoutes = data.routes;

    renderRoute(chooseRoute());
}

function chooseRoute() {

    if (!storedRoutes || storedRoutes.length === 0) return null;

    // Only one route available
    if (storedRoutes.length === 1) {
        return storedRoutes[0];
    }

    if (selectedMode === "faster") {
        // Fastest duration
        return storedRoutes.reduce((a, b) =>
            a.duration < b.duration ? a : b
        );
    }

    // SAFER MODE
    // First sort by risk (low risk first)
    let sortedByRisk = [...storedRoutes].sort((a, b) =>
        calculateRisk(a) - calculateRisk(b)
    );

    // If fastest and safest are same, pick second safest
    let fastest = storedRoutes.reduce((a, b) =>
        a.duration < b.duration ? a : b
    );

    if (sortedByRisk[0] === fastest && sortedByRisk.length > 1) {
        return sortedByRisk[1];
    }

    return sortedByRisk[0];
}

function calculateRisk(route) {

    let risk = 0;

    route.geometry.coordinates.forEach(c => {
        let distance = map.distance(
            [c[1], c[0]],
            [CENTRAL_ZONE.lat, CENTRAL_ZONE.lng]
        );
        if (distance < CENTRAL_ZONE.radius) risk += 5;
    });

    return risk;
}

function renderRoute(route) {

    if (routeLine) map.removeLayer(routeLine);

    let coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

    routeLine = L.polyline(coords, {
        color: selectedMode === "safer" ? "#16a085" : "#e67e22",
        weight: 6
    }).addTo(map);

    updateAnalytics(route);
}

function updateAnalytics(route) {

    let distanceKm = route.distance / 1000;
    let durationMin = route.duration / 60;

    // Slight ETA increase for safer route (if alternative exists)
    if (selectedMode === "safer" && storedRoutes.length > 1) {
        durationMin += 5;
    }

    // Congestion calculation (distance + duration model)
    // ===== Safe Congestion Model (0–100 cap) =====
    let rawCongestion = Math.floor(distanceKm * 3 + durationMin / 4);
    let congestion = Math.min(100, rawCongestion);

    // ===== Positive Fuel Model =====
    let baseFuel = 18;           // best case km/l
    let fuelDrop = congestion * 0.07;
    let fuelEfficiency = Math.max(7, baseFuel - fuelDrop);

    document.getElementById("fuelEfficiency").innerText =
        fuelEfficiency.toFixed(1) + " km/l";

    // ===== Route Complexity Calculation =====
    let turns = 0;
    let coords = route.geometry.coordinates;

    for (let i = 2; i < coords.length; i++) {

        let prev = coords[i - 2];
        let curr = coords[i - 1];
        let next = coords[i];

        let angle = Math.abs(
            Math.atan2(next[1] - curr[1], next[0] - curr[0]) -
            Math.atan2(curr[1] - prev[1], curr[0] - prev[0])
        );

        if (angle > 0.5) turns++;
    }

    let complexity;

    if (turns < 10) complexity = "Low";
    else if (turns < 25) complexity = "Moderate";
    else complexity = "High";

    // ===== Update Header KPIs =====
    document.getElementById("avgSpeed").innerText =
        (distanceKm / (durationMin / 60)).toFixed(0) + " km/h";

    document.getElementById("routeComplexity").innerText = complexity;

    document.getElementById("fuelEfficiency").innerText =
        (15 - congestion / 12).toFixed(1) + " km/l";

    document.getElementById("signalDensity").innerText =
        Math.floor(distanceKm * 2) + " signals";

    document.getElementById("lastUpdated").innerText = "just now";

    document.getElementById("routeComparison").innerText =
        `Distance: ${distanceKm.toFixed(1)} km | ETA: ${durationMin.toFixed(0)} min`;

    // ===== AI INSIGHTS (5 Practical Insights) =====

    // 1️⃣ Traffic Condition
    let trafficMessage;
    if (congestion < 40) {
        trafficMessage = "Traffic is light. Smooth drive expected.";
    } else if (congestion < 70) {
        trafficMessage = "Moderate traffic detected. Expect minor slowdowns.";
    } else {
        trafficMessage = "Heavy traffic ahead. Consider starting early.";
    }

    // 2️⃣ Time Reliability
    let reliability;
    if (congestion < 50) {
        reliability = "High chance of reaching on time.";
    } else if (congestion < 75) {
        reliability = "Possible minor delay. Keep buffer time.";
    } else {
        reliability = "High delay risk. Plan extra travel time.";
    }

    // 3️⃣ Driving Difficulty
    let difficultyMessage;
    if (complexity === "Low") {
        difficultyMessage = "Mostly straight roads. Easy drive for beginners.";
    } else if (complexity === "Moderate") {
        difficultyMessage = "Moderate number of turns. Drive attentively.";
    } else {
        difficultyMessage = "Many turns and junctions. Stay alert while driving.";
    }

    // 4️⃣ Fuel Advisory
    let fuelMessage;
    if (congestion < 50) {
        fuelMessage = "Fuel consumption likely to remain efficient.";
    } else {
        fuelMessage = "Frequent stops may increase fuel usage.";
    }

    // 5️⃣ Smart Recommendation
    let recommendationMessage =
        selectedMode === "safer"
            ? "Recommended for relaxed and safer driving."
            : "Best option if you are in a hurry.";

    // Update AI Insights Panel
    document.getElementById("aiInsights").innerHTML = `
        <li>${trafficMessage}</li>
        <li>${reliability}</li>
        <li>${difficultyMessage}</li>
        <li>${fuelMessage}</li>
        <li>${recommendationMessage}</li>
    `;
}

function selectMode(mode) {
    selectedMode = mode;
    document.getElementById("fasterBtn").classList.remove("active");
    document.getElementById("saferBtn").classList.remove("active");
    document.getElementById(mode + "Btn").classList.add("active");

    if (sourceMarker && destMarker) renderRoute(chooseRoute());
}

function resetMap() {
    if (routeLine) map.removeLayer(routeLine);
    if (sourceMarker) map.removeLayer(sourceMarker);
    if (destMarker) map.removeLayer(destMarker);
    sourceMarker = null;
    destMarker = null;
}

function bookCab(type) {

    if (!sourceMarker || !destMarker) return;

    let src = sourceMarker.getLatLng();
    let dst = destMarker.getLatLng();

    if (type === "ola") {
        window.open(`https://book.olacabs.com/?pickup_lat=${src.lat}&pickup_lng=${src.lng}&drop_lat=${dst.lat}&drop_lng=${dst.lng}`, "_blank");
    } else {
        window.open(`https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${src.lat}&pickup[longitude]=${src.lng}&dropoff[latitude]=${dst.lat}&dropoff[longitude]=${dst.lng}`, "_blank");
    }
}
