from skyfield.api import load
import numpy as np


# ==========================================
# Load time scale
# ==========================================
ts = load.timescale()


# ==========================================
# Load TLE data
# ==========================================
tle_file = "data/starlink.tle"
satellites = load.tle_file(tle_file)


# ==========================================
# Load Earth and Sun
# ==========================================
planets = load("de421.bsp")

earth = planets["earth"]
sun = planets["sun"]


# ==========================================
# Function: Get satellite states
# ==========================================
def get_satellite_states(t):

    # Sun position relative to Earth
    sun_position = (sun - earth).at(t).position.km

    sun_distance = np.linalg.norm(sun_position)

    # Direction from Earth toward Sun
    sun_direction = sun_position / sun_distance

    satellite_states = []

    for satellite in satellites:

        # Satellite position relative to Earth
        satellite_position = satellite.at(t).position.km

        x, y, z = satellite_position

        # Distance from Earth center
        satellite_distance = np.linalg.norm(
            satellite_position
        )

        # Check whether satellite is
        # on the opposite side of Earth
        dot_product = np.dot(
            satellite_position,
            sun_direction
        )

        behind_earth = dot_product < 0

        # Perpendicular distance from
        # Earth-Sun axis
        perpendicular_distance = np.linalg.norm(
            satellite_position
            - dot_product * sun_direction
        )

        # Earth radius
        earth_radius = 6378.137

        # Simplified eclipse condition
        eclipsed = (
            behind_earth
            and perpendicular_distance < earth_radius
        )

        # Store satellite state
        state = {
            "id": satellite.name,
            "x": float(x),
            "y": float(y),
            "z": float(z),
            "distance": float(satellite_distance),
            "eclipsed": bool(eclipsed)
        }

        satellite_states.append(state)

    return satellite_states


# ==========================================
# Testing
# ==========================================
if __name__ == "__main__":

    t = ts.now()

    states = get_satellite_states(t)

    eclipse_count = sum(
        state["eclipsed"]
        for state in states
    )

    sunlight_count = len(states) - eclipse_count

    print("Total satellites loaded:", len(satellites))

    print("\nTracking time:", t.utc_strftime())

    print("Total satellites:", len(states))

    print("Sunlight satellites:", sunlight_count)

    print("Eclipsed satellites:", eclipse_count)

    print("\nFirst 5 satellite states:\n")

    for state in states[:5]:
        print(state)