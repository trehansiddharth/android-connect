var thing   = require("node-thing"),
    dbus    = require("dbus-native"),
    logger  = require("log4js").getLogger("thing-gnotify"),
    util    = require("util");

var sessionBus = dbus.sessionBus();

thing.configure({
    mongoUri : "mongodb://localhost:27017",
    databaseName : "test",
    thingName : "laptop_arch"
});

thing.connect(function (err) {
    if (err) {
        logger.error("Error connecting to database: %s", util.inspect(err));
    } else {
        thing.start(function (err) {
            if (err) {
                logger.error("Error starting thing: %s", util.inspect(err));
            } else {
                logger.trace("Successfully started thing.");
                thing.sentinel("phone_moto", function (err, phone_moto) {
                    if (err) {
                        logger.error("Error getting phone_moto: %s", util.inspect(err));
                    } else {
                        sessionBus.getService("org.freedesktop.Notifications").getInterface("/org/freedesktop/Notifications", "org.freedesktop.Notifications", function (err, notifications) {
                            if (err) {
                                logger.error("Error connecting to org.freedesktop.Notifications: %s", util.inspect(err));
                            } else {
                                notifications.on("NotificationClosed", function (notification_id, reason) {
                                    phone_moto.query("delete_notification", notification_id, function (err, response) {
                                        if (err) {
                                            logger.error("Error deleting notification after closing: %s", util.inspect(err));
                                        } else {
                                            logger.trace("Successfully deleted notification with id %s", notification_id.toString());
                                        }
                                    });
                                });
                                var create_notification = function (property, notification) {
                                    logger.trace("property: %s", property);
                                    var body = notification.body;
                                    var summary = notification.summary;
                                    var icon = notification.icon.buffer.toString();
                                    var notification_id = notification.notification_id;
                                    var notification_count = notification.notification_count;

                                    notifications.Notify("Android Connect", notification_id, "linphone", summary, body, [], { }, 5000, function (err, new_notification_id) {
                                        if (new_notification_id) {
                                            phone_moto.query("update_notification_id", property, new_notification_id, function (err, result) {
                                                if (err) {
                                                    logger.error("Error while sending update_notification_id query: %s", util.inspect(err));
                                                } else {
                                                    logger.trace("Updated notification id successfully.");
                                                }
                                            });
                                        }
                                    });
                                }
                                phone_moto.subscribe(null, function (property, value) {
                                    if (property.slice(0, 12) == "notification" && value.propagate == true) {
                                        logger.trace("Got new notification: %s", util.inspect(value));
                                        create_notification(property, value);
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }
});
