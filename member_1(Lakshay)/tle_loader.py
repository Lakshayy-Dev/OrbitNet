from skyfield.api import load

tle_file = "data/starlink.tle"

satellites = load.tle_file(tle_file)

print("Number of satellites loaded:", len(satellites))

print("\nFirst 5 satellites:")

for satellite in satellites[:5]:
    print(satellite.name)