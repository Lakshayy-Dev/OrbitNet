import numpy as np

from eclipse_detector import get_satellite_states, ts


# ==========================================
# Configuration
# ==========================================
MAX_LINK_DISTANCE = 5000  # km
EARTH_RADIUS = 6378.137   # km


# ==========================================
# Get satellite states
# ==========================================
t = ts.now()

states = get_satellite_states(t)


# ==========================================
# Testing with first 10 satellites
# ==========================================
test_satellites = states[:10]


# ==========================================
# Function to check LOS
# ==========================================
def check_los(position_a, position_b):

    AB = position_b - position_a

    projection = -np.dot(
        position_a,
        AB
    ) / np.dot(AB, AB)

    projection = np.clip(
        projection,
        0,
        1
    )

    closest_point = (
        position_a +
        projection * AB
    )

    minimum_distance = np.linalg.norm(
        closest_point
    )

    return minimum_distance >= EARTH_RADIUS


# ==========================================
# Find valid communication links
# ==========================================
valid_links = []

for i in range(len(test_satellites)):

    for j in range(i + 1, len(test_satellites)):

        sat_a = test_satellites[i]
        sat_b = test_satellites[j]

        position_a = np.array([
            sat_a["x"],
            sat_a["y"],
            sat_a["z"]
        ])

        position_b = np.array([
            sat_b["x"],
            sat_b["y"],
            sat_b["z"]
        ])

        distance = np.linalg.norm(
            position_a - position_b
        )

        # First filter: distance
        if distance <= MAX_LINK_DISTANCE:

            # Second filter: LOS
            has_los = check_los(
                position_a,
                position_b
            )

            if has_los:

                valid_links.append({
                    "source": sat_a["id"],
                    "target": sat_b["id"],
                    "distance": distance
                })


# ==========================================
# Display
# ==========================================
print("\nMaximum link distance:",
      MAX_LINK_DISTANCE, "km")

print("Valid communication links:",
      len(valid_links))

print("\nValid links:\n")

for link in valid_links:

    print(
        f"{link['source']} <-> "
        f"{link['target']} : "
        f"{link['distance']:.2f} km"
    )