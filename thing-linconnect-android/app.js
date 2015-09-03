"use strict";

var thing   = require("node-thing"),
    mdns    = require("mdns"),
    http    = require("http"),
    logger  = require("log4js").getLogger("thing-linconnect-android"),
    express = require("express"),
    util    = require("util"),
    busboy  = require("connect-busboy"),
    mongo   = require("mongodb");

var ad = mdns.createAdvertisement(mdns.tcp("http"), 9090)
ad.start();

thing.configure({
    mongoUri : "mongodb://localhost:27017",
    databaseName : "test",
    thingName : "phone_moto"
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

                thing.onQuery("update_notification_id", function (property, new_notification_id, callback) {
                    thing.getStatus(property, function (err, value) {
                        if (err) {
                            logger.error("Could not update notification id properly: ", util.inspect(err));
                        } else {
                            value.notification_id = new_notification_id;
                            if (new_notification_id == 0) {
                                value.notification_count = 0;
                            }
                            value.propagate = false;
                            thing.updateStatus(property, value, function (err, result) {
                                if (err) {
                                    logger.error("Failed to update notification_id to new value: " + err);
                                    callback(null);
                                } else {
                                    logger.trace("Updated notification_id");
                                    callback(null);
                                }
                            });
                        }
                    });
                });

                thing.onQuery("delete_notification", function (notification_id, callback) {
                    thing.objects.device_status_collection.remove({ "value.notification_id" : notification_id }, function (err, result) {
                        if (err) {
                            logger.warn("Could not remove document with notification_id %s: %s", notification_id.toString(), util.inspect(err));
                            callback(null);
                        } else {
                            callback(null);
                        }
                    });
                });

                var fromBase64 = function (data) {
                    var buffer = new Buffer(data, "base64");
                    return buffer.toString();
                }

                var get_notification_appname = function (description) {
                    var len = description.length;
                    if (description.slice(0, 4) == "via ") {
                        return description.slice(4, len);
                    } else if (description[len - 1] == ')') {
                        for (var i = len - 1; i >= 0; i--) {
                            if (description[i] == '(') {
                                return description.slice(i+5, len-1);
                            }
                        }
                        return "Android";
                    } else {
                        return "Android";
                    }
                }

                var app = express();

                app.use(busboy({
                    limits : {
                        files : 1
                    }
                }));

                app.post("/notif", function (request, response) {
                    logger.trace("Got a new request.");
                    var notifheader = fromBase64(request.headers.notifheader);
                    var notifdescription = fromBase64(request.headers.notifdescription);
                    var notifappname = get_notification_appname(notifdescription);
                    var notifcount = 1;
                    logger.trace("header: %s, description: %s, appname: %s", notifheader, notifdescription, notifappname);

                    if (request.busboy) {
                        request.busboy.on("file", function (fieldname, file, filename, encoding, mimetype) {
                            var allParts = [];
                            file.on("data", function (data) {
                                allParts.push(data);
                            });
                            file.on("end", function () {
                                var fullData = Buffer.concat(allParts);
                                logger.trace("Assembled notificon data:");
                                logger.trace(fullData);
                                var notificon = new mongo.Binary(fullData);
                                var notifproperty = "notification_" + notifappname;
                                thing.getStatus(notifproperty, function (err, value) {
                                    if (err) {
                                        logger.error("Error while reading %s property: %s", notifproperty, util.inspect(err));
                                    } else {
                                        var notifinfo = {};
                                        if (value && value.notification_count > 0) {
                                            var notifcount = value.notification_count + 1;
                                            var notifinfo = {
                                                summary : notifappname,
                                                body : notifcount.toString() + " new notifications",
                                                icon : notificon,
                                                notification_count : notifcount,
                                                notification_id : value.notification_id,
                                                propagate : true
                                            };
                                        } else {
                                            var notifinfo = {
                                                summary : notifheader,
                                                body : notifdescription,
                                                icon : notificon,
                                                notification_count : 1,
                                                notification_id : 0,
                                                propagate : true
                                            };
                                        }
                                        thing.updateStatus(notifproperty, notifinfo, function (err, result) {
                                            if (err) {
                                                logger.error("There was an error pushing notification data: %s", util.inspect(notifinfo));
                                            } else {
                                                logger.trace("Successfully pushed notification info");
                                            }
                                        });
                                    }
                                })
                            });
                        });
                        request.busboy.on("finish", function () {
                            logger.trace("Done reading form.");
                            response.end("true");
                        });
                        request.pipe(request.busboy);
                    } else {
                        logger.warn("No multipart file data found.");
                    }
                });

                app.listen(9090);
            }
        });
    }
});
