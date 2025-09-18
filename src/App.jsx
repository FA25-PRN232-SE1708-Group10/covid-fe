import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import "highcharts/modules/map";
import "highcharts/modules/treemap";
import { useEffect, useRef, useState } from "react";
import "./App.css";
import { clearCachedData, getCachedData, setCachedData } from "./utils/cache";

const API_BASE_URL = "https://localhost:7164";

const countryNameMap = {
  US: "us",
  Russia: "ru",
  "United Kingdom": "gb",
  India: "in",
  Brazil: "br",
  France: "fr",
  Germany: "de",
  Turkey: "tr",
  Argentina: "ar",
  Iran: "ir",
  Spain: "es",
  Colombia: "co",
  Italy: "it",
  Indonesia: "id",
  Mexico: "mx",
  Poland: "pl",
  "South Africa": "za",
  Netherlands: "nl",
  Ukraine: "ua",
  Philippines: "ph",
  Peru: "pe",
  Malaysia: "my",
  Czechia: "cz",
  Canada: "ca",
  Japan: "jp",
  Iraq: "iq",
  Thailand: "th",
  Chile: "cl",
  Bangladesh: "bd",
  Israel: "il",
  Pakistan: "pk",
  Belgium: "be",
  Romania: "ro",
  Sweden: "se",
  Portugal: "pt",
  Vietnam: "vn",
  Austria: "at",
  Switzerland: "ch",
  Serbia: "rs",
  Hungary: "hu",
  Jordan: "jo",
  Greece: "gr",
  Kazakhstan: "kz",
  Slovakia: "sk",
  Morocco: "ma",
  Cuba: "cu",
  Bulgaria: "bg",
  Denmark: "dk",
  Ireland: "ie",
  Bolivia: "bo",
  "Costa Rica": "cr",
  Australia: "au",
  "Korea, South": "kr",
  China: "cn",
  Egypt: "eg",
  "New Zealand": "nz",
};

function normalizeCountryName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/\s+/g, "");
}

function App() {
  // For triggering a refetch after cache clear
  const [cacheResetFlag, setCacheResetFlag] = useState(0);
  const [allData, setAllData] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [latestDataByCountry, setLatestDataByCountry] = useState([]);
  const [progress, setProgress] = useState(0);
  const [totalCount, setTotalCount] = useState(null);
  const [fetchedCount, setFetchedCount] = useState(0);
  const progressRef = useRef(0);
  const [currentMetric, setCurrentMetric] = useState("Confirmed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [worldMapGeoData, setWorldMapGeoData] = useState(null);

  // Fetch world map geojson
  useEffect(() => {
    fetch("https://code.highcharts.com/mapdata/custom/world.geo.json")
      .then((res) => res.json())
      .then(setWorldMapGeoData)
      .catch(() => setWorldMapGeoData(null));
  }, []);

  // Fetch all data and show progress bar
  useEffect(() => {
    let isCancelled = false;
    async function fetchAllData() {
      setLoading(true);
      setError("");
      setProgress(0);
      setFetchedCount(0);
      setTotalCount(null);
      let all = [];
      const uniqueMap = new Map();
      try {
        // Try to get cached data first
        const cached = await getCachedData("covid-data-v1");
        if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
          all = cached.data;
          setAllData(all);
          setAvailableDates(cached.dates);
          setSelectedDate(cached.dates[cached.dates.length - 1] || "");
          setProgress(100);
          setFetchedCount(all.length);
          setTotalCount(all.length);
          setLoading(false);
          return;
        }
        // Get total count for progress
        const countRes = await fetch(`${API_BASE_URL}/odata/CovidData/$count`);
        if (!countRes.ok) throw new Error("Failed to fetch total count");
        const total = parseInt(await countRes.text(), 10);
        setTotalCount(total);
        let url = `${API_BASE_URL}/odata/CovidData`;
        while (url) {
          const response = await fetch(url, {
            headers: { accept: "application/json;odata.metadata=minimal;odata.streaming=true" },
          });
          if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
          const result = await response.json();
          if (Array.isArray(result.value)) {
            // Deduplicate by a composite key (CountryRegion+Date+ProvinceState if available)
            for (const d of result.value) {
              const key = `${d.CountryRegion || ""}|${d.ProvinceState || ""}|${d.Date}`;
              if (!uniqueMap.has(key)) {
                uniqueMap.set(key, d);
              }
            }
            all = Array.from(uniqueMap.values());
            setFetchedCount(all.length);
            setProgress(Math.min(100, Math.round((all.length / total) * 100)));
            progressRef.current = Math.min(100, Math.round((all.length / total) * 100));
          }
          url = result["@odata.nextLink"] || result["odata.nextLink"] || null;
        }
        if (!Array.isArray(all) || all.length === 0) throw new Error("No data returned from API");
        setAllData(all);
        // Setup available dates and select latest
        const dates = Array.from(
          new Set(
            all.map((d) => {
              const dateObj = new Date(d.Date);
              const yyyy = dateObj.getFullYear();
              const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
              const dd = String(dateObj.getDate()).padStart(2, "0");
              return `${yyyy}-${mm}-${dd}`;
            })
          )
        ).sort((a, b) => a.localeCompare(b));
        setAvailableDates(dates);
        setSelectedDate(dates[dates.length - 1] || "");
        // Cache the data for future loads
        await setCachedData("covid-data-v1", { data: all, dates });
      } catch {
        if (!isCancelled) setError("Failed to load data. Is the backend running?");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    fetchAllData();

    // cacheResetFlag is a dependency to allow refetching after cache clear
    return () => {
      isCancelled = true;
    };
  }, [cacheResetFlag]);

  // Update dashboard for selected date
  useEffect(() => {
    if (!selectedDate || !allData.length) return;
    const records = allData.filter((d) => d.Date.startsWith(selectedDate));
    const countryMap = {};
    records.forEach((d) => {
      const c = d.CountryRegion;
      if (!countryMap[c]) {
        countryMap[c] = { CountryRegion: c, Confirmed: 0, Deaths: 0, Recovered: 0 };
      }
      countryMap[c].Confirmed += Number(d.Confirmed) || 0;
      countryMap[c].Deaths += Number(d.Deaths) || 0;
      let recovered = d.Recovered;
      // removed typo check for 'Recorvered'
      countryMap[c].Recovered += Number(recovered) || 0;
    });
    setLatestDataByCountry(Object.values(countryMap));
  }, [selectedDate, allData]);

  // Global stats
  const totals = latestDataByCountry.reduce(
    (acc, country) => {
      acc.Confirmed += country.Confirmed;
      acc.Deaths += country.Deaths;
      acc.Recovered += country.Recovered || 0;
      return acc;
    },
    { Confirmed: 0, Deaths: 0, Recovered: 0 }
  );

  // Calculate previous day's totals for daily increase
  let prevTotals = { Confirmed: 0, Deaths: 0, Recovered: 0 };
  if (selectedDate && allData.length) {
    // Find previous date
    const prevDateIdx = availableDates.indexOf(selectedDate) - 1;
    if (prevDateIdx >= 0) {
      const prevDate = availableDates[prevDateIdx];
      const prevRecords = allData.filter((d) => d.Date.startsWith(prevDate));
      const prevCountryMap = {};
      prevRecords.forEach((d) => {
        const c = d.CountryRegion;
        if (!prevCountryMap[c]) {
          prevCountryMap[c] = { CountryRegion: c, Confirmed: 0, Deaths: 0, Recovered: 0 };
        }
        prevCountryMap[c].Confirmed += Number(d.Confirmed) || 0;
        prevCountryMap[c].Deaths += Number(d.Deaths) || 0;
        prevCountryMap[c].Recovered += Number(d.Recovered) || 0;
      });
      prevTotals = Object.values(prevCountryMap).reduce(
        (acc, country) => {
          acc.Confirmed += country.Confirmed;
          acc.Deaths += country.Deaths;
          acc.Recovered += country.Recovered || 0;
          return acc;
        },
        { Confirmed: 0, Deaths: 0, Recovered: 0 }
      );
    }
  }
  const dailyIncrease = {
    Confirmed: totals.Confirmed - prevTotals.Confirmed,
    Deaths: totals.Deaths - prevTotals.Deaths,
    Recovered: totals.Recovered - prevTotals.Recovered,
  };

  // Highcharts options
  const mapData = latestDataByCountry
    .map((d) => {
      let iso = countryNameMap[d.CountryRegion];
      if (!iso) {
        const normalized = normalizeCountryName(d.CountryRegion);
        const found = Object.entries(countryNameMap).find(([key]) => normalizeCountryName(key) === normalized);
        if (found) {
          iso = found[1];
        } else {
          iso = normalized;
        }
      }
      return [iso, d[currentMetric] || 0];
    })
    .filter((d) => d[1] > 0);

  const colorStops = {
    Confirmed: ["#aed6f1", "#3498db", "#21618c"],
    Deaths: ["#f5b7b1", "#e74c3c", "#922b21"],
    Recovered: ["#a9dfbf", "#2ecc71", "#196f3d"],
  };

  const mapOptions = {
    chart: { map: worldMapGeoData, backgroundColor: "#1f2937" },
    title: { text: `Global COVID-19 ${currentMetric} Cases` },
    mapNavigation: { enabled: true, buttonOptions: { verticalAlign: "bottom" } },
    colorAxis: {
      min: 1,
      type: "logarithmic",
      minColor: colorStops[currentMetric][0],
      maxColor: colorStops[currentMetric][2],
      stops: [
        [0, colorStops[currentMetric][0]],
        [0.5, colorStops[currentMetric][1]],
        [1, colorStops[currentMetric][2]],
      ],
    },
    series: [
      {
        data: mapData,
        name: currentMetric,
        states: { hover: { color: "#a4a4a4" } },
        tooltip: {
          valueSuffix: ` ${currentMetric}`,
        },
      },
    ],
  };

  const totalForMetric = latestDataByCountry.reduce((sum, d) => sum + (d[currentMetric] || 0), 0);
  // Calculate per-country daily increase for treemap
  let prevCountryMap = {};
  if (selectedDate && allData.length) {
    const prevDateIdx = availableDates.indexOf(selectedDate) - 1;
    if (prevDateIdx >= 0) {
      const prevDate = availableDates[prevDateIdx];
      const prevRecords = allData.filter((d) => d.Date.startsWith(prevDate));
      prevRecords.forEach((d) => {
        const c = d.CountryRegion;
        if (!prevCountryMap[c]) {
          prevCountryMap[c] = { Confirmed: 0, Deaths: 0, Recovered: 0 };
        }
        prevCountryMap[c].Confirmed += Number(d.Confirmed) || 0;
        prevCountryMap[c].Deaths += Number(d.Deaths) || 0;
        prevCountryMap[c].Recovered += Number(d.Recovered) || 0;
      });
    }
  }

  const treeMapData = latestDataByCountry
    .filter((d) => d[currentMetric] > 0)
    .map((d) => {
      const value = d[currentMetric];
      const percent = totalForMetric > 0 ? (value / totalForMetric) * 100 : 0;
      const prev = prevCountryMap[d.CountryRegion]?.[currentMetric] || 0;
      const dailyInc = value - prev;
      return {
        name: d.CountryRegion,
        value,
        colorValue: value,
        percent,
        dailyIncrease: dailyInc,
      };
    });

  const colors = {
    Confirmed: ["#3498db"],
    Deaths: ["#e74c3c"],
    Recovered: ["#2ecc71"],
  };

  const treeMapOptions = {
    chart: { backgroundColor: "#1f2937" },
    colorAxis: {
      minColor: Highcharts.color(colors[currentMetric][0]).brighten(0.4).get(),
      maxColor: Highcharts.color(colors[currentMetric][0]).brighten(-0.4).get(),
    },
    series: [
      {
        type: "treemap",
        layoutAlgorithm: "squarified",
        data: treeMapData,
        name: currentMetric,
        dataLabels: {
          enabled: true,
          style: {
            textOverflow: "clip",
            fontSize: "10px",
            fontWeight: "bold",
            color: "#000",
          },
          crop: false,
          overflow: "allow",
          allowOverlap: false,
          formatter: function () {
            // Only show name if box is big enough, else blank
            if (this.point.node && this.point.node.val && this.point.node.val < 0.01) return "";
            return this.point.name;
          },
        },
      },
    ],
    title: { text: `Countries by ${currentMetric} Cases` },
    tooltip: {
      useHTML: true,
      pointFormatter: function () {
        const dailyInc = this.dailyIncrease !== undefined ? this.dailyIncrease : 0;
        const dailyIncColor = this.series.name === "Deaths" ? "#ef4444" : this.series.name === "Recovered" ? "#22c55e" : "#3b82f6";
        return (
          `<b>${this.name}</b>: ${this.value.toLocaleString()} (${this.percent.toFixed(2)}%)<br>` + `<span style="color:${dailyIncColor};font-weight:bold;">+${dailyInc.toLocaleString()} today</span>`
        );
      },
    },
  };

  // Handler for clearing cache and refetching
  const handleClearCache = async () => {
    await clearCachedData("covid-data-v1");
    setCacheResetFlag((f) => f + 1);
  };

  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen">
      {/* Top right cache clear button */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={handleClearCache}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded shadow-lg transition-all duration-200"
          title="Delete cached data and refetch"
        >
          Clear Cached Data
        </button>
      </div>
      <div className="container mx-auto p-4 md:p-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white">COVID-19 Global Dashboard</h1>
        </header>

        {/* Date Picker & Progress Bar */}
        <div className="flex flex-col items-center gap-2 mt-2 w-full">
          {loading || error || !selectedDate ? (
            <p id="data-date" className="text-lg text-gray-400 m-0">
              {loading ? "Loading latest data..." : error ? error : "No data available"}
            </p>
          ) : (
            <div className="date-row">
              <span id="data-date" className="text-lg text-gray-400 m-0">
                Showing data for
              </span>
              <input
                id="date-picker"
                type="date"
                className="bg-gray-700 text-gray-200 rounded px-2 py-1"
                value={selectedDate}
                min={availableDates[0]}
                max={availableDates[availableDates.length - 1]}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ display: "inline-block" }}
                list="available-dates"
              />
            </div>
          )}
          <datalist id="available-dates">
            {availableDates.map((date) => (
              <option key={date} value={date} />
            ))}
          </datalist>
          {loading && totalCount && (
            <div className="w-full max-w-md mt-2">
              <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-3 bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
              <div className="text-xs text-gray-400 mt-1 text-center">
                {fetchedCount} / {totalCount} records loaded ({progress}%)
              </div>
            </div>
          )}
        </div>

        {/* Global Stats Cards */}
        <div id="stats-cards" className="stat-cards">
          {/* Confirmed */}
          <div className="stat-card confirmed">
            <h2>Total Confirmed</h2>
            <p id="total-confirmed">{totals.Confirmed.toLocaleString()}</p>
            <span className="daily-increase confirmed">+{dailyIncrease.Confirmed.toLocaleString()} today</span>
          </div>
          {/* Deaths */}
          <div className="stat-card deaths">
            <h2>Total Deaths</h2>
            <p id="total-deaths">{totals.Deaths.toLocaleString()}</p>
            <span className="daily-increase deaths">+{dailyIncrease.Deaths.toLocaleString()} today</span>
          </div>
          {/* Recovered */}
          <div className="stat-card recovered">
            <h2>Total Recovered</h2>
            <p id="total-recovered">{totals.Recovered.toLocaleString()}</p>
            <span className="daily-increase recovered">+{dailyIncrease.Recovered.toLocaleString()} today</span>
          </div>
        </div>

        {/* Chart Controls */}
        <div className="flex justify-center mb-8 bg-gray-800 rounded-lg p-2 max-w-md mx-auto">
          <button
            id="btn-confirmed"
            className={`metric-btn flex-1 py-2 px-4 rounded-md font-semibold transition-all duration-300 ${currentMetric === "Confirmed" ? "bg-blue-500 text-white" : "text-gray-300"}`}
            onClick={() => setCurrentMetric("Confirmed")}
          >
            Confirmed
          </button>
          <button
            id="btn-deaths"
            className={`metric-btn flex-1 py-2 px-4 rounded-md font-semibold transition-all duration-300 ${currentMetric === "Deaths" ? "bg-red-500 text-white" : "text-gray-300"}`}
            onClick={() => setCurrentMetric("Deaths")}
          >
            Deaths
          </button>
          <button
            id="btn-recovered"
            className={`metric-btn flex-1 py-2 px-4 rounded-md font-semibold transition-all duration-300 ${currentMetric === "Recovered" ? "bg-green-500 text-white" : "text-gray-300"}`}
            onClick={() => setCurrentMetric("Recovered")}
          >
            Recovered
          </button>
        </div>

        {/* Visualizations Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
          {/* World Map */}
          <div className="xl:col-span-3 bg-gray-800 p-4 rounded-lg shadow-lg min-h-[600px] flex items-center justify-center">
            {loading || !worldMapGeoData ? (
              <div className="text-center">
                <div className="loader mx-auto"></div>
                <p className="mt-4 text-gray-400">Loading Map...</p>
              </div>
            ) : error ? (
              <p className="text-red-400">Failed to load map data.</p>
            ) : (
              <div className="w-full h-full">
                <HighchartsReact highcharts={Highcharts} constructorType="mapChart" options={mapOptions} />
              </div>
            )}
          </div>
          {/* Treemap */}
          <div className="xl:col-span-2 bg-gray-800 p-4 rounded-lg shadow-lg min-h-[600px] flex items-center justify-center">
            {loading ? (
              <div className="text-center">
                <div className="loader mx-auto"></div>
                <p className="mt-4 text-gray-400">Loading Treemap...</p>
              </div>
            ) : error ? (
              <p className="text-red-400">Failed to load treemap data.</p>
            ) : (
              <div className="w-full h-full">
                <HighchartsReact highcharts={Highcharts} options={treeMapOptions} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
