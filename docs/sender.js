const securos = require('securos')

securos.connect(async (core) => {
        core.sendEvent("GEA", "1", "EVENT", {
            id: "1898",
            type: "CAM",
            name: "CAM01",
            action: "CAMERAOFFLINE",
        })
}) 