importScripts('https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.0.0/satellite.min.js');

self.onmessage = function(e) {
    const { satellites, simTime } = e.data;
    const time = new Date(simTime);
    const gmst = satellite.gstime(time);
    const results = [];

    satellites.forEach((sat, i) => {
        try {
            const pv = satellite.propagate(sat.rec, time);
            if (!pv.position) return;
            const gd = satellite.eciToGeodetic(pv.position, gmst);
            results.push({
                index: i,
                lat: satellite.degreesLat(gd.latitude),
                lon: satellite.degreesLong(gd.longitude),
            });
        } catch(e) {}
    });

    self.postMessage(results);
};