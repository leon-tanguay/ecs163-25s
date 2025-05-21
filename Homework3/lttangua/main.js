// Adjust canvas sizes based on window size
const mapWidth = window.innerWidth;
const mapHeight = window.innerHeight * 0.65;
const histWidth = window.innerWidth * 0.5;
const histHeight = window.innerHeight * 0.25;

let currentStreamKey = "weaptype1"; // default variable for coloring map and streamgraph
let mapColorScale;

// Set up main SVG for map
const svg = d3
  .select("#mapSvg")
  .attr("width", mapWidth)
  .attr("height", mapHeight);

// Add a little help box in bottom left corner with tips
// This will help guide the user (and the graders)
const instructions = svg
  .append("g")
  .attr("class", "map-instructions")
  .attr("transform", `translate(20, ${mapHeight - 60})`);

instructions
  .append("rect")
  .attr("width", 300)
  .attr("height", 75)
  .attr("fill", "#fff")
  .attr("stroke", "#333")
  .attr("stroke-width", 0.5)
  .attr("rx", 6)
  .attr("ry", 6)
  .attr("opacity", 0.95);

instructions
  .append("text")
  .attr("x", 10)
  .attr("y", 17)
  .style("font-size", "11px")
  .style("fill", "#000")
  .text("Click a year in the histogram to focus");

instructions
  .append("text")
  .attr("x", 10)
  .attr("y", 33)
  .style("font-size", "11px")
  .style("fill", "#000")
  .text("Use dropdown to change data type");

instructions
  .append("text")
  .attr("x", 10)
  .attr("y", 49)
  .style("font-size", "11px")
  .style("fill", "#000")
  .text("Animation - points will fade in upon loading new selection");

instructions
  .append("text")
  .attr("x", 10)
  .attr("y", 65)
  .style("font-size", "11px")
  .style("fill", "#000")
  .text("Use mouse to move and zoom in the map");



// Group to hold map elements like countries and points
const g = svg.append("g").attr("class", "map-layer");

// Set up zoom function
const zoom = d3
  .zoom()
  .scaleExtent([1, 8])
  .on("zoom", (event) => {
    g.attr("transform", event.transform);
  });

svg.call(zoom);

// Define how world map will be projected in 2D
const projection = d3
  .geoMercator()
  .scale(180)
  .center([0, 25])
  .translate([mapWidth / 2, mapHeight / 1.45]);

const path = d3.geoPath().projection(projection);

// Add a dynamic title to map
const title = svg
  .append("text")
  .attr("x", mapWidth / 8)
  .attr("y", 40)
  .attr("text-anchor", "left")
  .style("font-size", "20px")
  .style("font-weight", "bold")
  .text("Global Terrorism Incidents: 1970 - 2017");

// Create separate SVG for histogram at top
const histSvg = d3
  .select("#histSvg")
  .attr("width", histWidth)
  .attr("height", histHeight)
  .style("background", "#fff");

let allValidData = [];
let selectedYear = null;
let terrorismData = [];

// Define dropdown options and labels for streamgraph/map
const streamVars = [
  { key: "weaptype1", label: "Weapon Type" },
  { key: "attacktype1", label: "Attack Type" },
  { key: "region", label: "Region" },
  { key: "targtype1", label: "Target Type" },
];

// Helper function to get year with most incidents for scaling
function getMaxTotalPerYear(data) {
  const yearCounts = d3.rollups(
    data.filter((d) => d.iyear >= 1970 && d.iyear <= 2017 && !isNaN(d.iyear)),
    (v) => v.length,
    (d) => d.iyear
  );
  return d3.max(yearCounts, ([, count]) => count);
}

// Renders a streamgraph showing trends over time
// Tutorial: https://d3-graph-gallery.com/streamgraph.html
function drawStreamGraph(data, columnKey, containerId) {
  const svg = d3.select(containerId);
  svg.selectAll("path").remove();
  svg.selectAll(".stream-axis").remove();
  svg.selectAll(".stream-area").remove();

  const bbox = svg.node().getBoundingClientRect();
  const width = bbox.width;
  const height = bbox.height;
  const years = d3.range(1970, 2018);

  // Group and count incidents by yr and category
  const nested = d3.rollups(
    data.filter((d) => d.iyear >= 1970 && d.iyear <= 2017 && d[columnKey]),
    (v) => v.length,
    (d) => d.iyear,
    (d) => d[columnKey]
  );

  const stackedData = [];
  nested.forEach(([year, categories]) => {
    const entry = { year };
    categories.forEach(([cat, count]) => {
      entry[cat] = count;
    });
    stackedData.push(entry);
  });

  const labelKey = columnKey + "_txt";
  const codeToLabel = new Map();

  // Build label mapping for legend
  data.forEach((d) => {
    if (
      d[columnKey] &&
      d[labelKey] &&
      d[labelKey].toLowerCase() !== "unknown" &&
      d[labelKey].toLowerCase() !== "other" &&
      d[labelKey].trim() !== ""
    ) {
      codeToLabel.set(d[columnKey], d[labelKey].trim());
    }
  });

  // Get top 10 most common codes
  const frequencyMap = d3.rollups(
    data.filter(
      (d) =>
        d[columnKey] &&
        d[labelKey] &&
        d[labelKey].toLowerCase() !== "unknown" &&
        d[labelKey].toLowerCase() !== "other" &&
        d[labelKey].trim() !== ""
    ),
    (v) => v.length,
    (d) => d[columnKey]
  );

  const topN = 10;
  const sortedKeys = frequencyMap
    .sort((a, b) => d3.descending(a[1], b[1]))
    .slice(0, topN)
    .map(([key]) => key);

  const keys = sortedKeys.filter((key) => codeToLabel.has(key));

  const x = d3
    .scaleLinear()
    .domain(d3.extent(years))
    .range([40, width - 20]);
  const y = d3.scaleLinear().range([height - 90, 15]);

  const color = d3.scaleOrdinal().domain(keys).range(d3.schemeCategory10);

  const stack = d3
    .stack()
    .keys(keys)
    .order(d3.stackOrderInsideOut)
    .offset(d3.stackOffsetSilhouette);

  const series = stack(stackedData);

  y.domain([
    d3.min(series, (s) => d3.min(s, (d) => d[0])),
    d3.max(series, (s) => d3.max(s, (d) => d[1])),
  ]);

  const area = d3
    .area()
    .x((d) => x(d.data.year))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]));

  svg
    .selectAll("path")
    .data(series)
    .enter()
    .append("path")
    .attr("d", area)
    .attr("fill", (d) => color(d.key))
    .attr("stroke", "#333")
    .attr("stroke-width", 0.2)
    .attr("opacity", 0.85);

  svg
    .append("g")
    .attr("transform", `translate(0, ${height - 90})`)
    .call(
      d3
        .axisBottom(x)
        .tickFormat(d3.format("d"))
        .tickValues(years.filter((y) => y % 5 === 0))
    )
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .style("font-size", "10px");

  return { colorScale: color, keys, codeToLabel };
}

// Draws histogram of number of incidents per year
// Tutorial: https://d3-graph-gallery.com/graph/barplot_basic.html
function drawHistogram(data) {
  const cleaned = data.filter(
    (d) => d.iyear >= 1970 && d.iyear <= 2017 && !isNaN(d.iyear)
  );

  const yearStatsMap = d3.rollup(
    cleaned,
    (v) => ({
      count: v.length,
      fatalities: d3.sum(v, (d) => d.nkill || 0),
      wounded: d3.sum(v, (d) => d.nwound || 0),
    }),
    (d) => d.iyear
  );

  const yearData = Array.from(yearStatsMap, ([iyear, stats]) => ({
    iyear,
    count: stats.count,
    fatalities: stats.fatalities,
    wounded: stats.wounded,
  })).sort((a, b) => a.iyear - b.iyear);

  const margin = { top: 20, right: 20, bottom: 50, left: 60 };
  const histWidth = window.innerWidth * 0.45;
  const innerWidth = histWidth - margin.left - margin.right;
  const innerHeight = histHeight - margin.top - margin.bottom;

  const svg = d3
    .select("#histSvg")
    .attr("width", histWidth)
    .attr("height", histHeight);

  svg
    .append("text")
    .attr("x", histWidth / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .text("Terrorist Attacks Per Year");

  const chartG = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleBand()
    .domain(yearData.map((d) => d.iyear))
    .range([0, innerWidth])
    .padding(0.05);

  const yMax = getMaxTotalPerYear(data);
  const y = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]);

  const bars = chartG
    .selectAll("rect")
    .data(yearData)
    .enter()
    .append("rect")
    .attr("x", (d) => x(d.iyear))
    .attr("y", (d) => y(d.count))
    .attr("width", x.bandwidth())
    .attr("height", (d) => innerHeight - y(d.count))
    .attr("fill", "#aaa")
    .attr("cursor", "pointer")
    .on("click", function (event, d) {
      // Toggle year selection
      if (selectedYear === d.iyear) {
        selectedYear = null;
        drawPoints(allValidData);
        title.text("Global Terrorism Incidents: All Years");
        valueGroup.style("display", "none");
      } else {
        selectedYear = d.iyear;
        const yearPoints = allValidData.filter((p) => p.iyear === selectedYear);
        drawPoints(yearPoints);
        title.text(`Global Terrorism Incidents: ${selectedYear}`);

        const barX = x(d.iyear) + x.bandwidth() / 2;
        const barY = innerHeight / 2;

        valueGroup
          .attr("transform", `translate(${barX}, ${barY})`)
          .style("display", "block");

        attackText.text(`${d.count.toLocaleString()} attacks`);
        fatalityText.text(`${d.fatalities.toLocaleString()} fatalities`);
        woundText.text(`${d.wounded.toLocaleString()} wounded`);
      }

      bars.attr("fill", (b) => (selectedYear === b.iyear ? "#444" : "#aaa"));
    });

  const valueGroup = chartG.append("g").style("display", "none");

  valueGroup
    .append("rect")
    .attr("x", -65)
    .attr("y", -20)
    .attr("width", 130)
    .attr("height", 55)
    .attr("fill", "#fff")
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.95);

  attackText = valueGroup
    .append("text")
    .style("text-anchor", "middle")
    .style("font-size", "11px")
    .style("fill", "#000")
    .attr("dy", "-0.4em");

  fatalityText = valueGroup
    .append("text")
    .style("text-anchor", "middle")
    .style("font-size", "11px")
    .style("fill", "#000")
    .attr("dy", "1em");

  woundText = valueGroup
    .append("text")
    .style("text-anchor", "middle")
    .style("font-size", "11px")
    .style("fill", "#000")
    .attr("dy", "2.4em");

  chartG
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(x.domain().filter((d, i) => i % 5 === 0))
        .tickSizeOuter(0)
    )
    .call((g) =>
      g.select(".domain").attr("stroke", "#333").attr("stroke-width", 1)
    )
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .style("font-size", "9px")
    .style("fill", "#000");

  chartG.append("g").call(d3.axisLeft(y));
}

// Draws the base world map using GeoJSON features
// Tutorial: https://d3-graph-gallery.com/backgroundmap
function drawMap(worldData) {
  g.selectAll("path")
    .data(worldData.features)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("fill", "#ccc") // fill countries with light gray
    .attr("stroke", "#333"); // country borders
}

// Draws all attack circles on the map using color and size scales
function drawPoints(data) {
  const labelKey = currentStreamKey + "_txt";
  const categoryColor = mapColorScale;

  // Bigger circle = more people killed
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(data, (d) => d.nkill)])
    .range([1, 15]);

  // More deaths = darker circle
  const opacityScale = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.nkill)])
    .range([0.4, 1]);

  g.selectAll("circle")
    .data(data, (d) => d.eventid || `${d.latitude}-${d.longitude}`)
    .join(
      (enter) =>
        enter
          .append("circle")
          .attr("cx", (d) => projection([d.longitude, d.latitude])[0])
          .attr("cy", (d) => projection([d.longitude, d.latitude])[1])
          .attr("r", (d) => radiusScale(d.nkill))
          .attr("fill", (d) => {
            if (d[currentStreamKey] && d[labelKey]) {
              return categoryColor(d[currentStreamKey]);
            }
            return "#888";
          })
          .attr("stroke", "#333")
          .attr("stroke-width", 0.3)
          .attr("opacity", 0)
          .transition()
          .duration(400)
          .attr("opacity", (d) => opacityScale(d.nkill)),

      (update) =>
        update
          .transition()
          .duration(300)
          .attr("cx", (d) => projection([d.longitude, d.latitude])[0])
          .attr("cy", (d) => projection([d.longitude, d.latitude])[1])
          .attr("r", (d) => radiusScale(d.nkill))
          .attr("fill", (d) => {
            if (d[currentStreamKey] && d[labelKey]) {
              return categoryColor(d[currentStreamKey]);
            }
            return "#888";
          })
          .attr("opacity", (d) => opacityScale(d.nkill)),

      (exit) => exit.transition().duration(300).attr("opacity", 0).remove()
    );
}

// Draws a color legend for the map in the top-right corner
// Tutorial: https://d3-legend.susielu.com/
function drawMapLegend(keys, codeToLabel, colorScale) {
  const legendWidth = 180;
  const legendItemHeight = 15;
  const visibleItems = Math.min(keys.length, 12);
  const legendHeight = visibleItems * legendItemHeight + 10;

  const legendX = mapWidth - legendWidth - 90;
  const legendY = mapHeight / 8;

  // Clear any previous legend
  d3.select("#mapSvg").select(".map-legend").remove();

  const legend = d3
    .select("#mapSvg")
    .append("g")
    .attr("class", "map-legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

  legend
    .append("rect")
    .attr("x", -5)
    .attr("y", -5)
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .attr("fill", "#fff")
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.95);

  // For each top category, draw color and label
  keys.slice(0, visibleItems).forEach((key, i) => {
    const group = legend
      .append("g")
      .attr("transform", `translate(0, ${i * legendItemHeight})`);

    group
      .append("rect")
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", colorScale(key));

    group
      .append("text")
      .attr("x", 16)
      .attr("y", 10)
      .text(codeToLabel.get(key) || key)
      .style("font-size", "10px")
      .attr("fill", "#000");
  });
}

// Load the GeoJSON world map and terrorism CSV
Promise.all([
  d3.json(
    "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson"
  ),
  d3.csv("globalterrorismdb_0718dist.csv"),
]).then(([worldData, terrorismData]) => {
  // Convert string data to numbers so we can actually use it in scales and filters
  terrorismData.forEach((d) => {
    d.latitude = +d.latitude;
    d.longitude = +d.longitude;
    d.nkill = +d.nkill || 0;
    d.nwound = +d.nwound || 0;
    d.iyear = +d.iyear;
  });

  // Clean up and filter to valid data points that are not off the map
  allValidData = terrorismData
    .filter(
      (d) =>
        !isNaN(d.latitude) &&
        !isNaN(d.longitude) &&
        d.latitude > -60 &&
        d.latitude < 85 &&
        d.longitude > -180 &&
        d.longitude < 180 &&
        !(Math.abs(d.latitude) < 2 && Math.abs(d.longitude) < 2) && // avoid clustering at equator for data w no area
        d.nkill > 0 &&
        !isNaN(d.iyear)
    )
    .sort((a, b) => d3.descending(a.nkill, b.nkill))
    .slice(0, 10000); // show only top 10k incidents

  // When the user picks a new category (ex - attack type, region, etc.)
  d3.select("#streamVar").on("change", function () {
    currentStreamKey = this.value;
    const label = streamVars.find((d) => d.key === currentStreamKey).label;
    d3.select("#streamTitle").text(`${label} over Time`);

    // Re draw streamgraph with new category
    const { colorScale, keys, codeToLabel } = drawStreamGraph(
      terrorismData,
      currentStreamKey,
      "#streamSvg"
    );
    mapColorScale = colorScale;

    drawMapLegend(keys, codeToLabel, colorScale);

    // Preserve year selection after changing variable
    if (selectedYear) {
      const yearPoints = allValidData.filter((p) => p.iyear === selectedYear);
      drawPoints(yearPoints);
      title.text(`Global Terrorism Incidents: ${selectedYear}`);
    } else {
      drawPoints(allValidData);
      title.text("Global Terrorism Incidents: All Years");
    }
  });

  // Initial render: map, histogram, streamgraph, and legend
  drawMap(worldData);
  drawHistogram(terrorismData);

  const { colorScale, keys, codeToLabel } = drawStreamGraph(
    terrorismData,
    currentStreamKey,
    "#streamSvg"
  );
  mapColorScale = colorScale;
  drawMapLegend(keys, codeToLabel, colorScale);
  drawPoints(allValidData);
});

// Automatically remove intro popup on user interaction or timeout
function removeIntroPopup() {
  const popup = document.getElementById("introPopup");
  if (popup) popup.remove();
}

setTimeout(removeIntroPopup, 6000);
window.addEventListener("click", removeIntroPopup);
