from skyfield.api import load

# -----------------------------
# 1. Load time scale
# -----------------------------
ts = load.timescale()

# -----------------------------
# 2. Load TLE data
# -----------------------------
tle_file = "data/starlink.tle"
satellites = load.tle_file(tle_file)

print("Total satellites loaded:", len(satellites))

# -----------------------------
# 3. Choose one common time
# -----------------------------
t = ts.now()

print("Tracking time:", t.utc_strftime())
print()

# -----------------------------
# 4. Calculate position
#    for every satellite
# -----------------------------
satellite_states = []

for satellite in satellites:

    geocentric = satellite.at(t)

    x, y, z = geocentric.position.km

    state = {
        "id": satellite.name,
        "x": x,
        "y": y,
        "z": z
    }

    satellite_states.append(state)

# -----------------------------
# 5. Display first 5
# -----------------------------
print("First 5 satellite positions:\n")

for state in satellite_states[:5]:

    print(state)