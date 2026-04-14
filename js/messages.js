const pg = require("./pg");
var nextId;

function message(script, id, table, json, callback) {
    //Event id in table events
    pg.query(`SELECT * FROM ${table} ORDER BY id ASC`, function (res) {
        if (res.rowCount != 0) {
            nextId = res.rows[res.rowCount - 1].id + 1;
        } else nextId = 1;
        json.id = nextId;
        if (script == insert || script == select) {
            script(table, json, function (res) {
                // console.log(res);
            });
        } else if (script == update) {
            json.id = id;
            script(id, table, json, function (res) {});
        }
    });
}

function insert(table, json, callback) {
    //console.log(json);
    var insertQuery = `INSERT INTO ${table}(`;
    //Filds
    //console.log("query",json)
    for (var element in json) {
        if (Object.keys(json).indexOf(element) <= Object.keys(json).length - 2) {
            if (json[element] != null || json[element] != "") {
                try {
                    if (element == "time" || element == "resolution_time" || element == "response_time") {
                        var newtime = json[element].replace("T", " ");
                        insertQuery = insertQuery + element + ",";
                    } else {
                        insertQuery = insertQuery + '"' + element + '"' + ",";
                    }
                } catch (e) {}
            }
        } else if (Object.keys(json).indexOf(element) == Object.keys(json).length - 1) {
            //console.log(Object.keys(json).indexOf(element), (Object.keys(json).length-1), element);
            insertQuery = insertQuery + '"' + element + '"';
        }
    }
    insertQuery = insertQuery + ` ) VALUES (`;
    //Values
    for (var element in json) {
        if (Object.keys(json).indexOf(element) <= Object.keys(json).length - 2) {
            if (json[element] != null || json[element] != "") {
                try {
                    if (element == "time" || element == "resolution_time" || element == "response_time") {
                        var newtime = json[element].replace("T", " ");
                        insertQuery = insertQuery + "'" + newtime + "',";
                    } else {
                        insertQuery = insertQuery + "'" + json[element] + "',";
                    }
                } catch (e) {}
            }
        } else if (Object.keys(json).indexOf(element) == Object.keys(json).length - 1) {
            insertQuery = insertQuery + "'" + json[element] + "'";
        }
    }
    insertQuery = insertQuery + ` )`;
    pg.query(insertQuery, function (res) {
        console.log(insertQuery);
        console.log("Inserting Field into table events...");
        callback("Row inserted");
    });
}

function update(id, table, json, callback) {
    var UpdateQuery = `UPDATE ${table} SET `;
    for (var element in json) {
        // console.log(element, json[element])
        if (Object.keys(json).indexOf(element) <= Object.keys(json).length - 2) {
            if (json[element] != null || json[element] != "") {
                if (element == "incident_time" || element == "resolution_time" || element == "response_time") {
                    var newtime = json[element].replace("T", " ");
                    UpdateQuery = UpdateQuery + element + "='" + newtime + "',";
                } else {
                    UpdateQuery = UpdateQuery + element + "='" + json[element] + "',";
                }
            }
        } else if (Object.keys(json).indexOf(element) == Object.keys(json).length - 1) {
            UpdateQuery = UpdateQuery + element + "='" + json[element] + "'";
        }
    }

    UpdateQuery = UpdateQuery + ` WHERE id = ${id}`;

    //console.log(UpdateQuery);

    pg.query(UpdateQuery, function (res) {
        //console.log(`Updating Fields in table ${table}...`);
        callback("Row updated");
    });
}

function select(table, limit, callback) {
    var SelectQuery = `SELECT * FROM ${table} ORDER BY time DESC, id DESC LIMIT ${limit}`;

    //console.log(SelectQuery);
    pg.query(SelectQuery, function (res) {
        // console.log(`Selecting Fields in table ${table}...`);
        //console.log(res.rows);
        callback(res.rows);
    });
}

function select_filter(table, dates, callback) {
    try {
        var startDate = dates.start ? new Date(dates.start) : new Date(new Date().setHours(0, 0, 0, 0));
        var endDate = dates.end ? new Date(dates.end) : new Date(new Date().setHours(23, 59, 59, 999));

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            startDate = new Date(new Date().setHours(0, 0, 0, 0));
            endDate = new Date(new Date().setHours(23, 59, 59, 999));
        }

        function toLocalISOString(d) {
            const pad = (n) => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
        }

        var formattedStartDate = toLocalISOString(startDate);
        var formattedEndDate = toLocalISOString(endDate);

        var SelectQuery = `SELECT * FROM ${table} WHERE time BETWEEN '${formattedStartDate}' AND '${formattedEndDate}' ORDER BY time DESC, id DESC`;

        pg.query(SelectQuery, function (res) {
            callback(res.rows);
        });
    } catch (e) {
        console.log(e);
    }
}

function search(table, id, callback) {
    var SelectQuery = `SELECT * FROM ${table} WHERE id = ${id}`;

    //console.log(SelectQuery);
    pg.query(SelectQuery, function (res) {
        //console.log(`Searching Fields in table ${table}...`);
        //console.log(res.rows);
        callback(res.rows);
    });
}

function searchlike(table, field, id, callback) {
    var SelectQuery = `SELECT * FROM ${table} WHERE  ${field} = '${id}'`;

    console.log("searchlike", SelectQuery);
    pg.query(SelectQuery, function (res) {
        //console.log(`Searching Fields in table ${table}...`);
        //console.log(SelectQuery)
        //console.log(res.rows);
        callback(res.rows);
    });
}

function searchlike_order(table, field, id, order, callback) {
    var SelectQuery = `SELECT * FROM ${table} WHERE  ${field} = '${id}' ORDER BY ${order} ASC`;

    console.log("searchlike_order", SelectQuery);
    pg.query(SelectQuery, function (res) {
        // console.log(`Searching Fields in table ${table}...`);
        // console.log(SelectQuery)
        // console.log(res.rows);
        callback(res.rows);
    });
}

function _delete(table, id, callback) {
    var SelectQuery = `DELETE FROM ${table} WHERE id = ${id}`;

    console.log("_delete", SelectQuery);
    pg.query(SelectQuery, function (res) {
        //console.log(`Deleting Fields in table ${table}...`);
        //console.log(res.rows);
        callback(res.rows);
    });
}

function limit_database(interval, callback) {
    const tablesToDeleteFrom = ["events", "comments"];
    var DeleteQuery = "";
    for (const table of tablesToDeleteFrom) {
        DeleteQuery += `DELETE FROM ${table} WHERE ${
            table == "events" || table == "logs" ? "time" : "date"
        } < current_timestamp - interval '${interval}';\n`;
    }
    console.log("limit_database", DeleteQuery);
    pg.query(DeleteQuery, (res) => {
        callback(res);
    });
}

function query(query, callback) {
    //console.log(SelectQuery);
    pg.query(query, function (res) {
        //console.log(res.rows);
        callback(res.rows);
    });
}

//Do not modify this part
exports.message = message;
exports.insert = insert;
exports.select = select;
exports.select_filter = select_filter;
exports.update = update;
exports.search = search;
exports.searchlike = searchlike;
exports.searchlike_order = searchlike_order;
exports._delete = _delete;
exports.limit_database = limit_database;
exports.query = query;
