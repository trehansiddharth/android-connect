var thing   = require("node-thing"),
    dbus    = require("node-dbus"),
    logger  = require("log4js").getLogger("thing-gnotify"),
    util    = require("util");

var as_properties = function (options) {
    var properties = {};
    for (var option in options) {
        var value = options[option];
        var obj = {
            enumerable : true,
            configurable : true,
            writable : true,
            value : value
        };
        properties[option] = obj;
    }
    return properties;
}

var notify_dbus_options = as_properties({
    type : dbus.DBUS_MESSAGE_TYPE_METHOD_CALL,
    bus : dbus.DBUS_BUS_SESSION,
    destination : "org.freedesktop.Notifications",
    path : "/org/freedesktop/Notifications",
    iface : "org.freedesktop.Notifications",
    member : "Notify"
});

var closed_notification_dbus_options = as_properties({
    type : dbus.DBUS_MESSAGE_TYPE_SIGNAL,
    bus : dbus.DBUS_BUS_SESSION,
    destination : "org.freedesktop.Notifications",
    path : "/org/freedesktop/Notifications",
    iface : "org.freedesktop.Notifications",
    member : "NotificationClosed"
});

thing.configure({
    mongoUri : "mongodb://localhost:27017",
    databaseName : "test",
    thingName : "laptop_arch"
});

thing.connect(function (err) {
    if (err) {
        logger.error("Error while connecting to database: %s", util.inspect(err));
    } else {
        thing.start(function (err) {
            if (err) {
                logger.error("Error while starting thing: %s", util.inspect(err));
            } else {
                logger.trace("Successfully started thing.");
                thing.sentinel("phone_moto", function (err, phone_moto) {
                    if (err) {
                        logger.error("Error while getting phone_moto: %s", util.inspect(err));
                    } else {
                        var create_notification = function (property, notification) {
                            logger.trace("property: %s", property);
                            var body = notification.body;
                            var summary = notification.summary;
                            var icon = notification.icon.buffer.toString();
                            var notification_id = notification.notification_id;
                            var notification_count = notification.notification_count;

                            var notify_message = Object.create(dbus.DBusMessage, notify_dbus_options);
                            notify_message.appendArgs("susssasa{sv}i", "Android Connect", notification_id, "linphone", summary, body, [], { }, 5000);
                            notify_message.on("error", function (err) {
                                logger.error(err);
                            });
                            notify_message.on("methodResponse", function (new_notification_id) {
                                if (new_notification_id) {
                                    phone_moto.query("update_notification_id", property, new_notification_id, function (err, result) {
                                        if (err) {
                                            logger.error("Error while sending update_notification_id query: %s", util.inspect(err));
                                        } else {
                                            logger.trace("Updated notification id successfully.");
                                        }
                                    });

                                    var closed_notification_message = Object.create(dbus.DBusMessage, closed_notification_dbus_options);
                                    //closed_notification_message.appendArgs("uu", new_notification_id, 2);
                                    closed_notification_message.addMatch({});
                                    closed_notification_message.on("signalReceipt", function () {
                                        logger.trace(arguments);
                                    });
                                    closed_notification_message.on("error", function (err) {
                                        logger.error(err);
                                    })

                                    closed_notification_message.send();
                                }
                            });

                            notify_message.send();
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
