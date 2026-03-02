# Africa Railway Distance and Emissions Calculator v2

A web-based tool for calculating railway distances, travel times, and carbon emissions across **all 49 mainland African countries**. Built with OpenStreetMap data, optimized pathfinding algorithms, and a hybrid data architecture that combines pre-extracted static files with live API fallback.

🌐 **Live Demo:** [njfinney.github.io/Africa_Railway_Calculator](https://njfinney.github.io/Africa_Railway_Calculator)

---

## 🎯 What This Tool Does

- **Calculate actual railway distances** between any two stations across Africa
- **Estimate travel times** based on average freight speeds (35 km/h)
- **Calculate shipment times** including loading, unloading, and customs delays
- **Compute CO₂e emissions** per metric ton of cargo
- **Visualize routes** on an interactive map
- **Identify network disconnections** with gap analysis

---

## 🌍 Coverage

### 49 Mainland African Countries

| Region | Countries |
|--------|-----------|
| **North Africa** | Algeria, Egypt, Libya, Morocco, Sudan, Tunisia |
| **West Africa** | Benin, Burkina Faso, Côte d'Ivoire, Gambia, Ghana, Guinea, Guinea-Bissau, Liberia, Mali, Mauritania, Niger, Nigeria, Senegal, Sierra Leone, Togo |
| **Central Africa** | Angola, Cameroon, Central African Republic, Chad, Congo (Brazzaville), Congo (DRC), Equatorial Guinea, Gabon |
| **East Africa** | Burundi, Djibouti, Eritrea, Ethiopia, Kenya, Madagascar, Rwanda, Somalia, South Sudan, Tanzania, Uganda |
| **Southern Africa** | Botswana, Eswatini, Lesotho, Malawi, Mozambique, Namibia, South Africa, Zambia, Zimbabwe |

---

## 🏗️ Architecture

### Hybrid Data Approach

The v2 architecture dramatically reduces API calls and improves reliability:

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface                        │
│              (HTML + Tailwind CSS + Leaflet)            │
├─────────────────────────────────────────────────────────┤
│                  Application Logic                       │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ Static Data     │───▶│ Pre-extracted JSON files    │ │
│  │ (Primary)       │    │ Hosted on GitHub Pages      │ │
│  └─────────────────┘    └─────────────────────────────┘ │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ Live API        │───▶│ Overpass API (Fallback)     │ │
│  │ (Secondary)     │    │ Multiple endpoints          │ │
│  └─────────────────┘    └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                Pathfinding Engine                        │
│  • Binary Min-Heap Dijkstra (O(E + V log V))           │
│  • Disconnection Analysis with bidirectional BFS        │
│  • Graph built from railway geometry                    │
└─────────────────────────────────────────────────────────┘
```

### Key Benefits

1. **Faster Loading** - Pre-extracted data loads instantly vs. waiting for API
2. **Higher Reliability** - No rate limiting or timeout issues from Overpass API
3. **Offline-Capable** - Static data works without live API access
4. **Automatic Updates** - GitHub Actions refreshes data weekly

---

## 📊 How It Works

### Level 1: Simple Explanation

1. **Select countries** you want to explore
2. **Choose two stations** (origin and destination)
3. **Click calculate** - the tool finds the shortest railway path
4. **View results** - distance, time, emissions, and a map

### Level 2: Process Flow

```
User selects countries
        ↓
Load data (static JSON or live API)
        ↓
User selects two stations
        ↓
Build railway network graph
        ↓
Run Dijkstra's shortest path algorithm
        ↓
If connected: Show route + metrics
If disconnected: Analyze gap + show partial routes
```

### Level 3: Technical Details

#### Data Loading
1. **Check manifest** - See which countries have pre-extracted data
2. **Load static JSON** - Fast, reliable station and railway data
3. **Fallback to API** - Query Overpass if static data unavailable
4. **Merge and deduplicate** - Combine data from multiple sources

#### Graph Construction
1. **Parse railway geometry** - Extract lat/lon points from railway ways
2. **Create nodes** - Each coordinate becomes a graph node
3. **Create edges** - Adjacent points connected with haversine distance
4. **Build adjacency lists** - Efficient graph representation

#### Pathfinding (Binary Min-Heap Dijkstra)
```javascript
// O(E + V log V) time complexity
while (!heap.isEmpty()) {
    const { node, dist } = heap.pop();  // O(log V)
    if (visited.has(node)) continue;
    if (node === end) break;
    
    for (const edge of neighbors[node]) {
        const newDist = dist + edge.distance;
        if (newDist < distances[edge.to]) {
            distances[edge.to] = newDist;
            heap.push({ node: edge.to, dist: newDist });
        }
    }
}
```

#### Disconnection Analysis
When no path exists:
1. **BFS from start** - Find all reachable nodes
2. **BFS from end** - Find all reachable nodes
3. **Find gap** - Closest points between the two networks
4. **Calculate partial distances** - How far each network extends

---

## 📐 Calculations

### Railway Distance
- Actual distance along tracks (not straight-line)
- Sum of graph edge weights on shortest path
- Plus connection distance from stations to nearest rail nodes

### Travel Time
```
Travel Time (hours) = Railway Distance (km) / 35 km/h
```

### Shipment Time
```
Shipment Time (days) = Travel Time × 3 / 24
```
*Multiplier accounts for loading, unloading, customs, and delays*

### CO₂e Emissions
```
Emissions (kgCO₂e/MT) = Railway Distance (km) × 0.024278
```
*Based on 24.278 gCO₂e per ton-km for diesel rail freight*

---

## 🔧 Data Extraction System

### GitHub Actions Workflow

The repository includes automated data extraction that runs weekly:

```yaml
# Parallel extraction by region
Jobs:
  - extract-north-africa (6 countries, ~30 min)
  - extract-west-africa (15 countries, ~45 min)
  - extract-central-africa (8 countries, ~45 min)
  - extract-east-africa (11 countries, ~45 min)
  - extract-southern-africa (9 countries, ~30 min)
  - merge-and-commit (combines all data)
```

### Manual Extraction

Run locally with Node.js:

```bash
# Single country
node scripts/extract-railway-data.js ZA

# Multiple countries
node scripts/extract-railway-data.js ZA MW MZ

# Entire region
node scripts/extract-railway-data.js --region "Southern Africa"

# All countries
node scripts/extract-railway-data.js --all
```

### Data File Structure

```
data/
├── manifest.json           # Index of all available data
├── stations/
│   ├── ZA.json            # South Africa stations
│   ├── KE.json            # Kenya stations
│   └── ...
└── railways/
    ├── ZA.json            # South Africa railway geometry
    ├── KE.json            # Kenya railway geometry
    └── ...
```

---

## 🚀 Deployment

### GitHub Pages (Recommended)

1. Fork or clone this repository
2. Enable GitHub Pages in Settings → Pages
3. Select main branch as source
4. Access at `https://[username].github.io/Africa_Railway_Calculator`

### Local Development

```bash
# Clone repository
git clone https://github.com/njfinney/Africa_Railway_Calculator.git
cd Africa_Railway_Calculator

# Serve locally (any static server works)
python -m http.server 8000
# or
npx serve .
```

---

## ⚠️ Limitations

### Data Quality
- **OSM completeness varies** - Some countries have better mapping than others
- **Railway status unclear** - Active vs. abandoned lines not always distinguished
- **Station names inconsistent** - Some unnamed or using local variants

### Routing Constraints
- **No gauge consideration** - Standard and narrow gauge treated equally
- **No border restrictions** - Political limitations not modeled
- **Simplified speed** - Fixed 35 km/h doesn't reflect actual operations

### Technical Limits
- **Large areas slow** - Loading all 49 countries takes time
- **Memory intensive** - Building graph for continental routes uses significant RAM
- **API rate limits** - Live fallback may be throttled

---

## 🤝 Contributing

### High Priority
- [ ] Add gauge information (standard vs narrow)
- [ ] Distinguish active vs abandoned lines
- [ ] Improve emission factors by traction type

### Medium Priority
- [ ] Export routes to GPX/KML
- [ ] Multi-stop route planning
- [ ] Historical route comparisons

### How to Contribute
1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Make changes and test
4. Submit pull request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **OpenStreetMap contributors** - Railway infrastructure data
- **Overpass API** - OSM data access
- **Leaflet.js** - Interactive mapping
- **Tailwind CSS** - UI styling

---

**Built for African rail development 🚂**
