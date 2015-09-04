var thing   = require("node-thing"),
    dbus    = require("dbus-native"),
    logger  = require("log4js").getLogger("thing-gnotify"),
    util    = require("util"),
    fs      = require("fs");

var sessionBus = dbus.sessionBus();
var systemBus = dbus.systemBus();

var configurationFields = JSON.parse(fs.readFileSync("configuration_fields.json", "utf8"));

var configurationFileName = "configuration.json";

var configuration = JSON.parse(fs.readFileSync(configurationFileName, "utf8"));

var configurationErrors = false;
for (var field in configurationFields) {
    if (!(field in configuration)) {
        var value = configurationFields[field];
        if (value.default) {
            configuration[field] = value.default;
        } else if (value.required) {
            logger.error("The following field was not provided in the configuration file and does not have a default value:");
            logger.error("Field name: %s", field);
            logger.error("Field description: %s", value.description);
        }
    }
}
if (configurationErrors) {
    process.exit(1);
}

var create_notification = function (property, notification, device, notification_service) {
    logger.trace("property: %s", property);
    var body = notification.body;
    var summary = notification.summary;
    var icon = notification.icon.buffer.toString();
    var notification_id = notification.notification_id;
    var notification_count = notification.notification_count;

    notification_service.Notify("Android Connect", notification_id, configuration.notification_icon, summary, body, [], { }, configuration.notification_timeout, function (err, new_notification_id) {
        if (new_notification_id) {
            device.query("update_notification_id", property, new_notification_id, function (err, result) {
                if (err) {
                    logger.error("Error while sending update_notification_id query: %s", util.inspect(err));
                } else {
                    logger.trace("Updated notification id successfully.");
                    /*sessionBus.connection.on("message", function (msg) {
                        logger.trace(msg);
                    });
                    sessionBus.addMatch("type='signal',interface='" + configuration.notificationInterface + "',member='NotificationClosed',arg0=" + new_notification_id.toString());*/
                }
            });
        }
    });
}

thing.configure({
    mongoUri : configuration.mongoUri,
    databaseName : configuration.databaseName,
    oplogName : configuration.oplogName,
    thingName : configuration.thingName
});

thing.connect(function (err) {
    if (err) {
        logger.error("Error connecting to database: %s", util.inspect(err));
    } else {
        logger.trace("Successfully connected to database.");
        sessionBus.getService(configuration.notificationServiceName).getInterface(configuration.notificationObjectPath, configuration.notificationInterface, function (err, notification_service) {
            if (err) {
                logger.error("Error connecting to %s: %s", configuration.notificationServiceName, util.inspect(err));
            } else {
                logger.trace("Successfully connected to %s.", configuration.notificationServiceName);
                configuration.deviceNames.map(function (deviceName) {
                    logger.trace("Fetching %s...", deviceName);
                    thing.sentinel(deviceName, function (err, device) {
                        if (err) {
                            logger.error("Error getting %s: %s", deviceName, util.inspect(err));
                        } else {
                            logger.trace("Fetched %s", deviceName);
                            notification_service.on("NotificationClosed", function (notification_id, reason) {
                                device.query("delete_notification", notification_id, function (err, response) {
                                    if (err) {
                                        logger.error("Error deleting notification after closing: %s", util.inspect(err));
                                    } else {
                                        logger.trace("Successfully deleted notification with id %s", notification_id.toString());
                                    }
                                });
                            });

                            device.subscribe(null, function (property, value) {
                                if (property.slice(0, 12) == "notification" && value.propagate == true) {
                                    logger.trace("Got new notification: %s", util.inspect(value));
                                    create_notification(property, value, device, notification_service);
                                }
                            });
                        }
                    });
                });
            }
        });
    }
});
