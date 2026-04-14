//////////////////////////////
////Home Page main.js
//////////////////////////////
var options = { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" };
var options2 = { hour12: false, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" };
var options3 = { year: "numeric", month: "numeric", day: "numeric" };
var options4 = { hour: "numeric", minute: "numeric", second: "numeric" };
var options5 = { hour: "numeric", minute: "numeric" };
//global variables
var name_selected;
var contact_selected;
var cameras;
var coordinates = [];
let alertMessage = new AlertMessage();
var startDateFilter, endDateFilter;
var watchlistLPR = {};

var socket = io();

showLoadingIndicator();
socket.on("newEvent", function (msg) {
    if (msg.length == 0) return;

    console.log("receiving new event :", msg);
    buildTable(msg, true);
});
socket.on("Events", function (msg) {
    console.log("receiving event :", msg);
    buildTable(msg);
    hideLoadingIndicator();
});

document.addEventListener(
    "focus",
    function (event) {
        const target = event.target;
        if (target.tagName.toLowerCase() === "input") {
            event.stopPropagation();
        }
    },
    true
);

function incidents() {
    $(".nav-item").click(function (e) {
        //console.log(this);
        $(this).addClass("active").siblings().removeClass("active");
    });
    var inc = document.getElementById("incidents");
    inc.classList.remove("hidden");
}

var tabindex = undefined;

//////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////TABLA INCIDENTES/////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////

function buildTable(json, addToTable = false) {
    var table = "";
    var ids = $("tr")
        .map(function () {
            return parseInt($(this).attr("tabIndex"));
        })
        .get();

    for (var i = 0; i < json.length; i++) {
        var id = parseInt(json[i].id);
        const elementoEncontrado = ids.indexOf(id);
        if (addToTable && elementoEncontrado != -1) continue;

        table += '<tr class="table-row clickable-row" tabindex="' + json[i].id + '" onkeydown="keydown()">';

        // Setting ID
        table += '<td scope="row" id="id" hidden="true">' + json[i].id + "</td>";

        // Setting checkbox
        table +=
            '<td id="tdcheck_' +
            json[i].id +
            '"><input type="checkbox" id="check_' +
            json[i].id +
            '" name="' +
            json[i].object_id +
            '" value="1"></td>';

        if (json[i].type == "FACE_X_SERVER" && json[i].action == "MATCH") {
            var params = JSON.parse(JSON.parse(json[i].params).comment);

            json[i].camera_id = params.cam_id;
            switch (params.list.priority) {
                case 0:
                    json[i].priority = "Alta";
                    break;
                case 1:
                    json[i].priority = "Média";
                    break;
                case 2:
                    json[i].priority = "Baixa";
                    break;
            }
            json[i].name = params.person.first_name + " " + params.person.last_name;
            json[i].comment = params.person.notes;
        }
        if (json[i].type == "CAM") {
            json[i].camera_id = json[i].object_id;
        }
        if (json[i].type == "FACE_X_SERVER") {
            json[i].type = "FACEX";
        }
        if (json[i].type == "HTTP_EVENT_PROXY") {
            json[i].type = "EVENT_GATE";
            try {
                json[i].object_id = JSON.parse(JSON.parse(json[i].params).comment).ID;
            } catch (e) {
                json[i].camera_id = json[i].cam_id;
            }
        }
        if (json[i].action == "VCA_EVENT") {
            try {
                json[i].incident = JSON.parse(JSON.parse(json[i].params).comment).description;
            } catch (e) {
                console.error(e);
            }
        }
        if (json[i].type == "LPR_CAM") {
            json[i].name = JSON.parse(json[i].params).number;
            json[i].camera_id = JSON.parse(json[i].params).camera_id;
        }

        var priorityIcon = "";
        switch (json[i].priority) {
            case "Alta":
                priorityIcon = '<i class="fa fa-exclamation-triangle"></i>';
                break;
            case "Média":
                priorityIcon = '<i class="fa fa-exclamation-circle"></i>';
                break;
            case "Baixa":
                priorityIcon = '<i class="fa fa-info-circle" aria-hidden="true"></i>';
                break;
        }
        table += '<td id="priority" hidden="true" class="to_hide" value="' + (json[i].priority || "") + '">' + priorityIcon + "</td>";

        // Adding other table cells
        table += '<td id="type">' + (json[i].type == "GENERIC_USER" ? "USER" : json[i].type) + "</td>";
        table += '<td id="object_id" style="text-align:center" class="to_hide">' + json[i].object_id + "</td>";
        table += '<td id="name">' + json[i].name + "</td>";
        table += '<td id="incident">' + json[i].incident + "</td>";
        table +=
            '<td id="time">' + new Date(json[i].time).toLocaleDateString("pt-br", options2) + "." + json[i].time.slice(-4, -1) + "</td>";
        table += '<td id="state" class="to_hide">' + (json[i].state || "") + "</td>";
        table += '<td id="operator" class="to_hide">' + json[i].operator + "</td>";
        table +=
            '<td id="responsetime" class="to_hide">' +
            (json[i].response_time ? new Date(json[i].response_time).toLocaleTimeString("pt-br", options5) : "") +
            "</td>";
        table +=
            '<td id="resolution_time" class="to_hide">' +
            (json[i].resolution_time ? new Date(json[i].resolution_time).toLocaleTimeString("pt-br", options5) : "") +
            "</td>";
        table += '<td hidden="true" id="comment" class="to_hide">' + (json[i].comment || "") + "</td>";
        table += '<td hidden="true" id="action" class="to_hide">' + json[i].action + "</td>";
        table += '<td hidden="true" id="priority" class="to_hide">' + json[i].priority + "</td>";
        table += '<td hidden="true" id="procedure" class="to_hide">' + json[i].procedure + "</td>";
        table += '<td hidden="true" id="id_cam" class="to_hide">' + json[i].camera_id + "</td>";
        table += '<td hidden="true" id="params" class="to_hide">' + json[i].params + "</td>";
        table += "</tr>";

        if (addToTable) {
            try {
                const regex = /null/gi;
                table = table.replace(regex, "");
                var rows = $("#rows");
                rows.prepend(table);
                rows.find("tr").addClass("tbody");
                filter();
            } catch (e) {
                document.getElementById("test").innerHTML = "Error 303: " + e;
            }
        }
    }

    if (!addToTable) {
        try {
            const regex = /null/gi;
            table = table.replace(regex, "");
            var rows = document.getElementById("rows");
            rows.innerHTML = table;
            rows.classList.add("tbody");
            filter();
        } catch (e) {
            document.getElementById("test").innerHTML = "Error 303: " + e;
        }
    }

    ready($);
}

$(".dropdown-toggle").dropdown();

//Document update functions JQUERY when new event
function ready($) {
    console.log("tabindex: ", tabindex);
    //Reselect the active row when a new EVENT
    $("tr[tabindex=" + tabindex + "]").addClass("table-selected");
    console.log($("tr[tabindex=" + tabindex + "]"));
    var item = document.getElementById("transferCard");
    var hasClass = item.classList.contains("hidden");
    if (hasClass) $("tr[tabindex=" + tabindex + "]").focus();

    /////////////////////////////////
    //Click Incidents Rows
    ////////////////////////////////

    $(document).ready(function ($) {
        $(document).on("dblclick", ".table-row", function () {
            try {
                var cam_id = document.getElementById("card_id").innerHTML;
                var params = document.getElementById("params").innerHTML;
                console.log("On Click Incidents Rows to show cam_id", cam_id, params);
                var date = document.getElementById("card_incidentDate").innerHTML;
                ISScustomAPI.sendReact("MEDIA_CLIENT", Média_client, "ADD_SEQUENCE", '{"mode":"1x1","seq":"' + cam_id + '"}');
            } catch (e) {
                document.getElementById("test").innerHTML = e;
            }
        });

        $(".table-row").click(function (e) {
            //console.log('clic:', e);
            if (e.target.getAttribute("type") != "checkbox") {
                var item = document.getElementById("contactCard");
                if (!item.classList.contains("hidden")) {
                    item.classList.add("hidden");
                }

                $(this).addClass("table-selected").siblings().removeClass("table-selected");
                //variables for Incidents TAB
                var id = $(this)
                    .find("td#" + "id")
                    .html();
                var incidentTime = $(this)
                    .find("td#" + "time")
                    .html();
                var camera = $(this)
                    .find("td#" + "object_id")
                    .html();
                var priority = $(this)
                    .find("td#" + "priority")
                    .html();
                var state = $(this)
                    .find("td#" + "state")
                    .html();
                var comment = $(this)
                    .find("td#" + "comment")
                    .html();
                var id_cam = $(this)
                    .find("td#" + "id_cam ")
                    .html();

                var title = document.getElementById("card_title");
                var d = document.getElementById("card_incidentDate");
                var t = document.getElementById("card_incidentTime");
                var c = (document.getElementById("card_camera").innerHTML = camera);
                var p = (document.getElementById("card_priority").innerHTML = priority);

                var s = (document.getElementById("card_state").innerHTML = state);
                var i = (document.getElementById("card_id").innerHTML = id_cam);

                title.innerHTML = id;
                d.innerHTML = incidentTime;

                c.innerHTML = camera;
                p.innerHTML = priority;
                s.innerHTML = state;

                tabindex = id;
                var rows = document.getElementById("incidentCard");
                var table = document.getElementById("tablediv");
                var filters = document.getElementById("tablediv");
                var table = document.getElementById("tablediv");

                //Resize Cols for Incidents TAB and Incidents Table
                if (rows.classList.contains("hidden")) {
                    rows.classList.remove("hidden");
                    table.classList.replace("col-md-12", "col-md-8");
                    table.classList.add("tablediv");
                }
                console.log("Clic Abonbado", $(this).find("td").html(), camera);
                socket.emit("abonado", $(this).find("td").html(), camera);
            }
        });
    });
}

//-------------------------- JQUERYS Section -----------------

//Activate Multiple Select filter for Incidents Type
$(".select").selectpicker({ noneSelectedText: "Tipo de prioridade", width: "100%" });

//Close Incidents TAB  deselect rows and goto top table
$(".closeCard").click(function (e) {
    var rows = document.getElementById("incidentCard");
    var table = document.getElementById("tablediv");
    if (!rows.classList.contains("hidden")) {
        rows.classList.add("hidden");
        table.classList.replace("col-md-8", "col-md-12");

        $(".table-row").removeClass("table-selected");
        $(".table-row").first().focus();

        console.log("Close");
    }
});

//dropdowns clicks
$("a.dropdown-item").click(function (e) {
    var action = e.currentTarget.innerHTML;
    state(action);
});

//Format timePicker and filter table by date-time
$(document).ready(function () {
    socket.emit("filter", { start: moment().startOf("days"), end: moment().endOf("days") });
    $("#datetimepicker").daterangepicker({
        timePicker: true,
        timePicker24Hour: true,
        locale: {
            format: "DD/MM/YYYY HH:mm:ss",
            applyLabel: "Aplicar",
            cancelLabel: "Cancelar",
            customRangeLabel: "Custom",
            daysOfWeek: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
            monthNames: [
                "Janeiro",
                "Fevereiro",
                "Março",
                "Abril",
                "Maio",
                "Junho",
                "Julho",
                "Agosto",
                "Setembro",
                "Outubro",
                "Novembro",
                "Dezembro",
            ],
        },
        opens: "center",
    });

    $("#datetimepicker").on("apply.daterangepicker", function (ev, picker) {
        filterByDateTime(picker.startDate, picker.endDate);
    });
});

//-------------------------- JQUERYS  END  -----------------

//-------------------- USER FUNCTIONS -------------------

//Export to PDF
$("#pdf").on("click", () => {
    var table = document.getElementById("table");
    var tableData = [];

    for (var i = 0; i < table.rows.length; i++) {
        if (table.rows[i].style.display !== "none") {
            var rowData = [];
            var cells = table.rows[i].cells;
            for (var j = 3; j <= 13; j++) {
                rowData.push(cells[j].innerText);
            }
            tableData.push(rowData);
        }
    }

    var docDefinition = {
        pageOrientation: "landscape",
        content: [
            { text: "Relatório - GEA", style: "header", alignment: "center" },
            { text: "\n" },
            { text: new Date().toLocaleString(), style: "subheader", alignment: "center" },
            { text: "\n\n" },
            {
                table: {
                    body: tableData,
                    widths: ["auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto", 50, "auto"],
                },
            },
        ],
        defaultStyle: {
            fontSize: 8,
            alignment: "center",
        },
        styles: {
            header: {
                fontSize: 18,
                bold: true,
            },
        },
    };

    var pdfDoc = pdfMake.createPdf(docDefinition);
    pdfDoc.download("RelatórioPDF_" + formattedDateTime(new Date()) + ".pdf");
});

//Export to CSV
$("#csv").on("click", () => {
    const table = document.getElementById("table");
    let csv = [];
    for (let i = 0; i < table.rows.length; i++) {
        if (table.rows[i].style.display !== "none") {
            let row = [];
            for (let j = 3; j <= table.rows[i].cells.length - 4; j++) {
                row.push(table.rows[i].cells[j].innerText);
            }
            csv.push(row.join(";"));
        }
    }
    const csvContent = csv.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "RelatórioCSV_" + formattedDateTime(new Date()) + ".csv");
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});

//Send Update State event to server
function state(value) {
    var isoDateTime = new Date();
    var localDate = dateYYYYMMDD(isoDateTime);
    var localTime = isoDateTime.toLocaleTimeString("us", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        mili: "2-digit",
        hour12: false,
    });
    localTime += "." + isoDateTime.getMilliseconds();
    var localtimeString = localDate + " " + localTime;
    var id = document.getElementById("card_title").innerHTML;
    var co = document.getElementById("card_comment").value;
    var obj_id = document.getElementById("card_camera").innerHTML;
    var auxid = document.querySelector('tr[tabindex="' + id + '"]');
    var currentState = auxid.querySelector("tr td#state").textContent;
    console.log("state ", id, currentState);

    var json = {
        id: id,
        obj_id: obj_id,
        state: value,
        operator: operator || "Usuário Externo",
        comment: co,
    };
    //console.log('json',json)
    document.getElementById("card_comment").value = "";

    switch (value) {
        case "Em Tratamento":
            if (["Em Tratamento", "Solucionado", "Falha de Sistema", "Novo", "Reconhecido", "Alarme"].includes(currentState)) {
                json.comment = "Evento em tratamento: " + json.comment;
                json.response_time = localtimeString;
                break;
            }

        case "Solucionado":
            if (["Em Tratamento", "Falha de Sistema", "Novo", "Reconhecido", "Alarme"].includes(currentState)) {
                json.comment = "Evento solucionado : " + json.comment;
                json.resolution_time = localtimeString;
            }
            break;
        case "Falha de Sistema":
        case "Reconhecido":
        case "Alarme":
            json.resolution_time = localtimeString;
            json.comment = value + " : " + json.comment;
            break;
        default:
    }

    document.getElementById("card_state").innerHTML = value;
    console.log("function state state", json, "currentState", currentState);
    socket.emit("state", json);
}

function masiveState(value, id, obj_id) {
    var isoDateTime = new Date();
    var localDate = dateYYYYMMDD(isoDateTime);
    var localTime = isoDateTime.toLocaleTimeString("us", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        mili: "2-digit",
        hour12: false,
    });
    var localTime = localTime + "." + isoDateTime.getMilliseconds();
    var localtimeString = localDate + " " + localTime;
    var co = "";
    var auxid = document.querySelector('tr[tabindex="' + id + '"]');
    var currentState = auxid.querySelector("tr td#state").textContent;
    console.log("masiveState id ", currentState);

    var json = {
        id: id,
        obj_id: obj_id,
        state: value,
        operator: operator || "Usuário Externo",
        comment: co,
    };

    if (value == "Em Tratamento" && currentState == "Novo") {
        json.comment += "Evento registrado em massa";
        json.response_time = localtimeString;
        console.log("masiveState state", json, "currentState", currentState);
        socket.emit("state", json);
    } else if (value == "Solucionado" && ["Em Tratamento", "Falha de Sistema", "Novo", "Reconhecido", "Alarme"].includes(currentState)) {
        json.resolution_time = localtimeString;
        json.comment += "Evento solucionado em massa";
        console.log("masiveState state", json, "currentState", currentState);
        socket.emit("state", json);
    }
}

//Send Update Priority event to server
function priority(priority) {
    var isoDateTime = new Date();
    var localDate = dateYYYYMMDD(isoDateTime);
    var localTime = isoDateTime.toLocaleTimeString("us", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        mili: "2-digit",
        hour12: false,
    });
    var localTime = localTime + "." + isoDateTime.getMilliseconds();
    var localtimeString = localDate + " " + localTime;
    var id = document.getElementById("card_title").innerHTML;
    var co = document.getElementById("card_comment").value;
    var json = {
        id: id,
        priority: priority,
        response_time: localtimeString,
        operator: operator || "Usuário Externo",
        comment: co,
    };
    document.getElementById("card_priority").innerHTML = priority;
    socket.emit("state", json);
}

// Filter Incidents  main Table

var filtername = "";
var filterincident = [];
var filterstate = "";

function filterByName() {
    var input;
    input = document.getElementById("filterbyname");
    filtername = input.value.toUpperCase();
    filter();
}

function filterByIncident(obj) {
    var input;
    filterincident = [];
    var incidents = document.getElementById("filterbyincident");

    for (var i = 0; i < incidents.options.length; i++) {
        if (incidents.options[i].selected) {
            //console.log(incidents.options[i].value)
            filterincident.push(incidents.options[i].value);
        }
    }
    console.log("filterincident:", filterincident);
    if (filterincident == []) {
        filterincident = "";
        incidents.options[0].selected();
    }
    filter();
}

function filterByState(obj) {
    var input;
    console.log(obj.value);
    filterstate = obj.value;
    if (filterstate == "All") filterstate = "";
    filter();
}

function filterByDateTime(startDate, endDate) {
    showLoadingIndicator();

    document.getElementById("datetimepicker").style.border = "dotted 3px #fff";
    newEvents = 0;
    var startDateBRT = new Date(startDate);
    var endDateBRT = new Date(endDate);

    var startDateUTC = new Date(startDateBRT.getTime() - startDateBRT.getTimezoneOffset() * 60000);
    var endDateUTC = new Date(endDateBRT.getTime() - endDateBRT.getTimezoneOffset() * 60000);

    socket.emit("filter", { start: startDateUTC.toISOString(), end: endDateUTC.toISOString() });

    socket.off("newEvent");
    socket.on("newEvent", function (msg) {
        if (msg.length == 0) return;

        console.log("receiving new event :", msg);
        newEvents++;

        events = document.getElementById("newEvents");

        events.innerHTML = '<i class="fa fa-bell" aria-hidden="true"></i> ' + newEvents + " Eventos Novos";

        hideLoadingIndicator();
    });
}

function showLoadingIndicator() {
    // Display loading indicator (e.g., show a spinner)
    var loadingIndicator = document.getElementById("loadingIndicator");
    loadingIndicator.style.display = "block";
}

function hideLoadingIndicator() {
    // Hide loading indicator
    var loadingIndicator = document.getElementById("loadingIndicator");
    loadingIndicator.style.display = "none";
}

function cancelFilter() {
    showLoadingIndicator();

    document.getElementById("newEvents").innerHTML = "";
    document.getElementById("datetimepicker").style.border = "";
    socket.off("newEvent");
    socket.on("newEvent", function (msg) {
        if (msg.length == 0) return;

        console.log("receiving new event :", msg);
        buildTable(msg, true);
    });
    socket.emit("filter", { start: moment().startOf("days"), end: moment().endOf("days") }, (res) => {
        console.log(res);
        buildTable(res);
        hideLoadingIndicator();
    });
}

function filter() {
    try {
        var f1 = true;
        var f2 = true;
        var f3 = true;
        var f4 = true;
        var td1, td2, td3, td4, td5;
        activeIncidents = 0;
        limitRows = 100;
        table = document.getElementById("table");
        tr = table.getElementsByTagName("tr");

        for (i = 1; i < tr.length; i++) {
            td1 = tr[i].getElementsByTagName("td")[5]; // Name
            td2 = tr[i].getElementsByTagName("td")[10]; // Type of Incident
            td3 = tr[i].getElementsByTagName("td")[8]; // State
            td4 = tr[i].getElementsByTagName("td")[4]; // ID
            td5 = tr[i].getElementsByTagName("td")[2]; // Priority
            td6 = tr[i].getElementsByTagName("td")[6]; // Event
            // td5 = td5.getElementsByTagName("button")[0];   // ID

            // Filter By Name
            if (td1 && filtername != "") {
                txtValue = td1.textContent || td1.innerText; // 2
                txtValue2 = td6.textContent || td6.innerText; // 2
                txtValue3 = td4.textContent || td4.innerText; // 2
                var f_name = txtValue.toUpperCase().indexOf(filtername) > -1;
                var f_event = txtValue2.toUpperCase().indexOf(filtername) > -1;
                var f_id = txtValue3.toUpperCase().indexOf(filtername) > -1;
                f1 = f_name || f_id || f_event;
            } else f1 = true;

            // Filter By Incident
            if (td5 && filterincident != "") {
                txtValue = td5.getAttribute("value");
                for (var p in filterincident) {
                    if (filterincident[p].toUpperCase() == "ALL") {
                        f2 = true;
                        break;
                    }
                    if (filterincident[p].toUpperCase() == txtValue.toUpperCase()) {
                        f2 = true;
                        break;
                    } else {
                        f2 = false;
                    }
                }
            } else f2 = true;

            // Filter By State
            if (td3 && filterstate != "") {
                txtValue = td3.textContent || td3.innerText;
                f3 = txtValue.toUpperCase() == filterstate.toUpperCase();
            } else f3 = true;

            // Check filters
            if (f1 && f2 && f3 && f4 && td3) {
                txtValue = td3.textContent || td3.innerText;

                if (txtValue == "Novo" || txtValue == "Em Tratamento") {
                    activeIncidents++;
                }

                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }

        active = document.getElementById("activeIncidents");

        // LIMIT ROWS
        // while(limitRows - tr.length < 0) [...document.querySelectorAll("tr")].pop().remove()

        active.innerHTML =
            '<i class="fa fa-exclamation-triangle triangle" aria-hidden="true"></i> ' + activeIncidents + " Incidentes Ativos";
    } catch (e) {
        console.log(e);
    }
}

function newMessage(e) {
    e.preventDefault();
}

//-------------------------------------SecurOS  SECTION -------------------------------------
//This integration, only work when the front Ends is used into SecurOS Desktop
//
var operator;
var Média_client;
//Start SecurOS Connection
starSecurOS();

function starSecurOS() {
    try {
        ISScustomAPI.onSetup(function (js_settings) {
            console.log("starSecurOS jsonSettings", js_settings);
            let jsonSettings = JSON.parse(js_settings);

            document.getElementById("test").innerHTML = jsonSettings.operator;
            Média_client = jsonSettings.media_client_id;
            console.log("starSecurOS Média_client", Média_client);
            operator = jsonSettings.operator;
            /*var advance
            //advance = jsonSettings.advanced;
            //advance = JSON.parse(advance);
            //document.getElementById("test").innerHTML = advance.config;
            try {
                if (advance.config == true) {
                    // document.getElementById("setup").style.display = "inline";
                }
            }
            catch (e) {
                //document.getElementById("test").innerHTML = e;
            }*/
        });
    } catch (e) {}
}

function seleccionarTodos() {
    console.log("seleccionarTodos");
    var icono = document.getElementById("seleccionarTodos");
    icono.classList.toggle("clicked");
    var count = 0;
    var checkboxes = document.querySelectorAll('input[type="checkbox"]');
    console.log(checkboxes);
    for (var i = 0; i < checkboxes.length; i++) {
        var checkbox = checkboxes[i];
        var parentTr = checkbox.closest("tr");
        if (parentTr && window.getComputedStyle(parentTr).display !== "none") {
            checkboxes[i].checked = icono.classList.contains("clicked");
            count++;
            if (count >= 20) {
                //alert('Solo se pueden seleccionar hasta 100 checkboxes.');
                var confirm = alertMessage.alertMessage("Você só pode selecionar no máximo 20 eventos", "danger");
                break;
            }
        }
    }
}
function check1() {
    console.log("check1");
    var checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < checkboxes.length; i++) {
        if (checkboxes[i].checked) {
            id_split = checkboxes[i].id.split("_");
            id = id_split[1];
            console.log(id, id_split, checkboxes[i].name);
            masiveState("Em Tratamento", id, checkboxes[i].name);
            checkboxes[i].checked = false;
        }
    }
    var check = document.getElementById("seleccionarTodos");
    check.classList.remove("clicked");
    //
}
function check2() {
    console.log("check2");
    var icono = document.getElementById("check2");
    icono.classList.toggle("clicked");
    var checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < checkboxes.length; i++) {
        if (checkboxes[i].checked) {
            id_split = checkboxes[i].id.split("_");
            id = id_split[1];
            console.log(id, id_split, checkboxes[i].name);
            masiveState("Solucionado", id, checkboxes[i].name);
            checkboxes[i].checked = false;
        }
    }
    var check = document.getElementById("seleccionarTodos");
    check.classList.remove("clicked");
}

// Count checked events and show in the title
document.querySelector("[data-field=response_time]").addEventListener("mouseover", () => {
    const checkedEvents = document.querySelectorAll("[id*=check_]:checked").length;
    const eventosString = checkedEvents === 1 ? "evento" : "eventos";
    const texto = `${checkedEvents} ${eventosString} selecionado${checkedEvents === 1 ? "" : "s"} ficar${
        checkedEvents === 1 ? "á" : "ão"
    } em tratamento`;

    document.querySelector("#check1 > title").textContent = texto;
});

document.querySelector("[data-field=resolution_time]").addEventListener("mouseover", () => {
    const checkedEvents = document.querySelectorAll("[id*=check_]:checked").length;
    const eventosString = checkedEvents === 1 ? "evento" : "eventos";
    const texto = `${checkedEvents} ${eventosString} selecionado${checkedEvents === 1 ? "" : "s"} ser${
        checkedEvents === 1 ? "á" : "ão"
    } solucionado${checkedEvents === 1 ? "" : "s"}`;

    document.querySelector("#check2 > title").textContent = texto;
});

//SecurOS User Functions
//Play Button
function play() {
    var cam_id = document.getElementById("card_title").innerHTML;
    var specificTdElement = document.querySelectorAll('[tabindex="' + cam_id + '"]');
    cam_id = specificTdElement[0].querySelector("#id_cam").textContent;
    //console.log(specificTdElement[0].querySelector('#object_id').textContent)
    //var expresionRegular = /\s*,\s*/;
    //var listaCamaras = cam_id.split(expresionRegular);
    //var mode = ''
    //if (listaCamaras.length > 1)
    //   mode = '2x2'
    //else
    mode = "1x1";

    console.log('{"mode":' + mode + ',"seq":"' + cam_id.replace(/,/g, "|") + '"}');
    try {
        var dateString = document.getElementById("card_incidentDate").innerHTML;
        const [day, month, year, time] = dateString.split(/[\/\s]/);
        console.log("time: ", time);
        var year_ = year.replace(",", "");
        // Ajustamos el mes, ya que en JavaScript los meses van de 0 a 11 const
        adjustedMonth = parseInt(month, 10) - 1;
        // Dividimos la hora en horas y minutos
        const [hour, minute, second, ampm] = time.split(":").map((component) => parseInt(component, 10));
        const isoDateTime = new Date(year_, adjustedMonth, day, hour, minute, second);
        // console.log(year, adjustedMonth, day, hour, minute,second,time)
        // console.log(isoDateTime)
        var localDate = dateToDDMMYY(isoDateTime);
        //console.log(localDate);
        var localTime = isoDateTime.toLocaleTimeString("us", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            mili: "2-digit",
            hour12: false,
        });
        //console.log(localTime )
        var localTime = localTime + "." + isoDateTime.getMilliseconds();
        //console.log(localTime )
        var localtimeString = localDate + " " + localTime;
        //console.log(localtimeString )
        console.log(
            "play MEDIA_CLIENT",
            Média_client,
            "SEEK",
            '{"date":"' + localDate + '","time":"' + localTime + '","cam":"' + cam_id.replace(/,/g, "|") + '"}'
        );
        ISScustomAPI.sendReact(
            "MEDIA_CLIENT",
            Média_client,
            "ADD_SEQUENCE",
            '{"mode":"' + mode + '","seq":"' + cam_id.replace(/,/g, "|") + '"}'
        );
        ISScustomAPI.sendReact(
            "MEDIA_CLIENT",
            Média_client,
            "SEEK",
            '{"date":"' + localDate + '","time":"' + localTime + '","cam":"' + cam_id.replace(/,/g, "|") + '"}'
        );
    } catch (e) {
        document.getElementById("test").innerHTML = e;
        console.log(e);
    }
}

//Live Button
function live() {
    var cam_id = document.getElementById("card_title").innerHTML;
    var specificTdElement = document.querySelectorAll('[tabindex="' + cam_id + '"]');
    cam_id = specificTdElement[0].querySelector("#id_cam").textContent;
    // var cam_id = document.getElementById('card_id').innerHTML;
    // var expresionRegular = /\s*,\s*/;
    // var listaCamaras = cam_id.split(expresionRegular);
    // var mode = ''
    // if (listaCamaras.length > 1)
    //    mode = '2x2'
    // else
    mode = "1x1";

    console.log('live {"mode":' + mode + ',"seq":"' + cam_id.replace(",", "|") + '"}');

    try {
        ISScustomAPI.sendReact(
            "MEDIA_CLIENT",
            Média_client,
            "ADD_SEQUENCE",
            '{"mode":"' + mode + '","seq":"' + cam_id.replace(",", "|") + '"}'
        );
    } catch (e) {
        document.getElementById("test").innerHTML = e;
    }
}

// FaceX Function
//NEW
window.addEventListener("click", () => {
    const eventType = document.querySelector(".table-selected > #type").innerHTML;
    if (!["FACEX", "MURALHA"].includes(eventType)) {
        try {
            ISScustomAPI.sendEvent("CAM", "1", "CLEAR");
        } catch (e) {
            document.getElementById("test").innerHTML = e;
        }
    } else {
        try {
            const ip_address = "localhost";
            const rest_api_port = "8888";
            const [username, password] = ["Admin", "123"];
            const auth = { Authorization: `Basic ${btoa(username + ":" + password)}` };
            var params, camId;

            if (eventType === "MURALHA") {
                params = {
                    name: document.querySelector(".table-selected > #name").textContent,
                    timestamp: document.querySelector(".table-selected > #time").textContent,
                    cam_id: document.querySelector(".table-selected > #object_id").textContent,
                    comment: document.querySelector(".table-selected > #comment").textContent,
                    image: document.querySelector(".table-selected > #params").textContent,
                };
            } else {
                params = document.querySelector(".table-selected > #params").textContent;
                if (!params.includes("detection")) return;
            }
            camId = params.cam_id || JSON.parse(JSON.parse(params).comment.replace(/:\s*,/g, ': "",')).cam_id;
            const url = `http://${ip_address}:${rest_api_port}/api/v1/cameras/${encodeURIComponent(camId)}`;

            fetch(url, { method: "GET", headers: auth })
                .then((response) => response.json())
                .then((json) => {
                    payload =
                        eventType === "MURALHA"
                            ? JSON.stringify({ params: JSON.stringify(params), type: "MURALHA" })
                            : JSON.stringify({ cam_name: /* json.data.name */ "Teste", params: params });
                    ISScustomAPI.sendEvent("CAM", "1", "FACE_X_INFO", payload);
                })
                .catch((e) => {
                    document.getElementById("test").innerHTML = e;
                    console.log(e);
                });
        } catch (e) {
            document.getElementById("test").innerHTML = e;
        }
    }
});

//Dates funtions
function dateToDDMMYY(date) {
    var d = date.getDate();
    var m = date.getMonth() + 1; //Month from 0 to 11
    var y = date.getYear() - 100;
    return (d <= 9 ? "0" + d : d) + "-" + (m <= 9 ? "0" + m : m) + "-" + y;
}
//Dates funtions
function dateYYYYMMDD(date) {
    var d = date.getDate();
    var m = date.getMonth() + 1; //Month from 0 to 11
    var y = date.getFullYear();
    return y + "-" + (m <= 9 ? "0" + m : m) + "-" + (d <= 9 ? "0" + d : d);
}

function timeHHMMSS(date) {
    return date.toLocaleTimeString().split(":").join("-");
}

function formattedDateTime(date) {
    return dateToDDMMYY(date) + "_" + timeHHMMSS(date);
}
////////// end securOS section //////////////////////
