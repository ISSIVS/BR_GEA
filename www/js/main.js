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
var fleuryLogoBase64 = null;
var activeAlarmClass = "";
var operator = "Usuário Externo";

fetch("/me")
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data && data.user) {
            operator = data.user;
            var el = document.getElementById("test");
            if (el) el.textContent = operator;
            // Ambiente interno SecurOS: sem opção de sair
            if (data.securos) {
                var logoutBtn = document.getElementById("logoutBtn");
                if (logoutBtn) logoutBtn.style.display = "none";
            }
        }
    })
    .catch(function() {});

fetch("images/fleury_logo.png")
    .then(function(res) { return res.blob(); })
    .then(function(blob) {
        var reader = new FileReader();
        reader.onloadend = function() { fleuryLogoBase64 = reader.result; };
        reader.readAsDataURL(blob);
    })
    .catch(function() { fleuryLogoBase64 = null; });

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
    refreshOpenCard();
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

function getAlarmClass(action) {
    if (!action) return "";
    if (action === "INTRUSAO DETECTADA") return "alarm-intrusao";
    if (action === "PERDEU SINAL") return "alarm-perda-sinal";
    if (action.includes("SEKRON")) return "alarm-sekron";
    return "";
}

var CHECKLISTS = {
    "alarm-perda-sinal": {
        titulo: "🔔 Perda de Sinal",
        perguntas: [
            "Gravador (DVR/NVR) foi verificado?",
            "Indisponibilidade de câmera foi confirmada?",
            "Evento exige acionamento técnico?"
        ]
    },
    "alarm-intrusao": {
        titulo: "🚨 Intrusão Detectada",
        perguntas: [
            "Imagens foram avaliadas?",
            "Evento confirmado ou tratado?",
            "Ação necessária foi tomada?"
        ]
    },
    "alarm-sekron": {
        titulo: "🔵 Evento Sekron",
        perguntas: [
            "Evento foi avaliado?",
            "Imagens foram verificadas ou houve contato com o local?",
            "Evento demandou ação operacional?"
        ]
    }
};

function renderChecklist(alarmClass, savedProcedure, readonly) {
    var area = document.getElementById("checklistArea");
    var content = document.getElementById("checklistContent");
    var checklist = CHECKLISTS[alarmClass];

    if (!checklist) {
        area.style.display = "none";
        content.innerHTML = "";
        return;
    }

    var disabled = readonly ? ' disabled' : '';
    var html = '<div class="checklist-title">' + checklist.titulo + (readonly ? ' <small style="opacity:.6;font-weight:400">(concluído)</small>' : '') + '</div>';
    checklist.perguntas.forEach(function(pergunta, idx) {
        html +=
            '<div class="checklist-item">' +
                '<span>' + pergunta + '</span>' +
                '<div class="checklist-options">' +
                    '<label><input type="radio" name="cl_' + idx + '" value="Sim"' + disabled + '> Sim</label>' +
                    '<label><input type="radio" name="cl_' + idx + '" value="Não"' + disabled + '> Não</label>' +
                '</div>' +
            '</div>';
    });

    content.innerHTML = html;
    area.style.display = "block";
    var actions = document.getElementById("checklistActions");
    if (actions) actions.style.display = readonly ? "none" : "flex";

    // Restore saved answers
    if (savedProcedure) {
        try {
            var saved = JSON.parse(savedProcedure);
            Object.keys(saved).forEach(function(name) {
                var radio = content.querySelector('input[name="' + name + '"][value="' + saved[name] + '"]');
                if (radio) radio.checked = true;
            });
        } catch(e) {}
    }

    if (!readonly) {
        updateConcluirBtn();
        content.addEventListener("change", updateConcluirBtn);
    }
}

function updateConcluirBtn() {
    var btn = document.getElementById("btnConcluir");
    if (btn) btn.disabled = !allChecklistAnswered();
}

function allChecklistAnswered() {
    var content = document.getElementById("checklistContent");
    if (!content) return true;
    var allRadios = content.querySelectorAll("input[type=radio]");
    if (allRadios.length === 0) return false;
    var names = new Set(Array.from(allRadios).map(function(r) { return r.name; }));
    var checkedNames = new Set(Array.from(content.querySelectorAll("input[type=radio]:checked")).map(function(r) { return r.name; }));
    return checkedNames.size === names.size;
}

function getChecklistData() {
    var area = document.getElementById("checklistArea");
    if (!area || area.style.display === "none") return null;
    var radios = area.querySelectorAll("input[type=radio]:checked");
    if (radios.length === 0) return null;
    var result = {};
    radios.forEach(function(r) { result[r.name] = r.value; });
    return JSON.stringify(result);
}

function saveChecklist() {
    var checklistData = getChecklistData();
    if (!checklistData) {
        alertMessage.alertMessage("Preencha ao menos uma resposta antes de salvar.", "danger");
        return;
    }
    var id = document.getElementById("card_title").innerHTML;
    if (!id) return;
    socket.emit("procedure", { id: id, procedure: checklistData });

    // Update DOM so reopening the event reflects the new answers immediately
    var row = document.querySelector('tr[tabindex="' + id + '"]');
    if (row) {
        var procedureTd = row.querySelector("td#procedure");
        if (procedureTd) procedureTd.innerHTML = checklistData;
    }

    showToast("Checklist salvo.");
}

// Re-renderiza o card atualmente aberto quando chega atualização do servidor
// (ex.: outro operador salvou o checklist ou mudou o status). Preserva edição em andamento.
function refreshOpenCard() {
    var card = document.getElementById("incidentCard");
    if (!card || card.classList.contains("hidden")) return;

    var id = (document.getElementById("card_title").innerHTML || "").trim();
    if (!id) return;
    var row = document.querySelector('tr[tabindex="' + id + '"]');
    if (!row) return;

    var state = ((row.querySelector("td#state") || {}).textContent || "").trim();
    var savedProcedure = (row.querySelector("td#procedure") || {}).innerHTML || "";

    var cardState = document.getElementById("card_state");
    if (cardState) cardState.innerHTML = state;

    var rowClasses = row.getAttribute("class") || "";
    activeAlarmClass = ["alarm-intrusao", "alarm-perda-sinal", "alarm-sekron"].find(function (c) {
        return rowClasses.includes(c);
    }) || "";

    var concluded = state === "Concluído" || state === "Alarme Falso";
    if (concluded) {
        // Readonly: seguro re-renderizar sempre
        renderChecklist(activeAlarmClass, savedProcedure, true);
    } else if (state === "Em Atendimento Técnico") {
        // Editável: só re-renderiza se não houver respostas em andamento (evita apagar a edição do operador)
        var hasLocalEdits = document.querySelectorAll("#checklistContent input[type=radio]:checked").length > 0;
        if (!hasLocalEdits) renderChecklist(activeAlarmClass, savedProcedure, false);
    }
}

function showToast(msg, type) {
    var bg = type === "danger" ? "#e53935" : "#2eb052";
    var toast = document.getElementById("checklistToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "checklistToast";
        toast.style.cssText = "position:fixed;bottom:1.5em;right:1.5em;color:#fff;padding:0.4em 1em;border-radius:4px;font-size:0.8em;z-index:99999;opacity:1;transition:opacity 0.4s";
        document.body.appendChild(toast);
    }
    toast.style.background = bg;
    toast.textContent = msg;
    toast.style.opacity = "1";
    toast.style.display = "block";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() {
        toast.style.opacity = "0";
        setTimeout(function() { toast.style.display = "none"; }, 400);
    }, 2000);
}

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

        var alarmClass = getAlarmClass(json[i].action);
        table += '<tr class="table-row clickable-row ' + alarmClass + '" tabindex="' + json[i].id + '" onkeydown="keydown()">';

        // Setting ID
        table += '<td scope="row" id="id" hidden="true">' + json[i].id + "</td>";

        // Setting checkbox (hidden)
        table +=
            '<td id="tdcheck_' +
            json[i].id +
            '" style="display:none"><input type="checkbox" id="check_' +
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
            '<td id="responsetime" class="to_hide" style="display:none">' +
            (json[i].response_time ? new Date(json[i].response_time).toLocaleTimeString("pt-br", options5) : "") +
            "</td>";
        table +=
            '<td id="resolution_time" class="to_hide" style="display:none">' +
            (json[i].resolution_time ? new Date(json[i].resolution_time).toLocaleTimeString("pt-br", options5) : "") +
            "</td>";
        table += '<td hidden="true" id="comment" class="to_hide">' + (json[i].comments_history || json[i].comment || "") + "</td>";
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

    $(document).off("dblclick.tablerow").on("dblclick.tablerow", ".table-row", function () {
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

    $(document).off("click.tablerow").on("click.tablerow", ".table-row", function (e) {
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
                var rowClasses = $(this).attr("class") || "";
                activeAlarmClass = ["alarm-intrusao", "alarm-perda-sinal", "alarm-sekron"].find(function(c) {
                    return rowClasses.includes(c);
                }) || "";
                var savedProcedure = $(this).find("td#procedure").html() || "";
                var hasComment = comment && comment.trim() !== "" && comment !== "null";

                var concluded = state === "Concluído" || state === "Alarme Falso";
                if (state === "Em Atendimento Técnico" || hasComment || concluded) {
                    renderChecklist(activeAlarmClass, savedProcedure, concluded);
                } else {
                    document.getElementById("checklistArea").style.display = "none";
                    document.getElementById("checklistContent").innerHTML = "";
                }

                console.log("Clic Abonbado", $(this).find("td").html(), camera);
                socket.emit("abonado", $(this).find("td").html(), camera);
            }
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

function formatProcedureForPDF(procedureText, actionText) {
    if (!procedureText || procedureText === "null" || procedureText === "undefined") return "";
    var alarmClass = getAlarmClass(actionText);
    var checklist = CHECKLISTS[alarmClass];
    if (!checklist) return "";
    try {
        var saved = JSON.parse(procedureText);
        return checklist.perguntas.map(function(q, idx) {
            var ans = saved["cl_" + idx] || "-";
            var short = q.length > 40 ? q.substring(0, 38) + "…" : q;
            return short + ": " + ans;
        }).join("\n");
    } catch(e) { return ""; }
}

//Export to PDF
$("#pdf").on("click", () => {
    var table = document.getElementById("table");

    // Columns to export: index → label  (comentário/checklist handled separately)
    var cols = [
        { idx: 3,  label: "Objeto" },
        { idx: 4,  label: "ID" },
        { idx: 5,  label: "Nome" },
        { idx: 6,  label: "Evento" },
        { idx: 7,  label: "Data / Hora" },
        { idx: 8,  label: "Estado" },
        { idx: 9,  label: "Operador" },
    ];

    // Fixed cols sum to ~513pt; last col ('*') fills the rest of the 793pt usable width
    var colWidths = [40, 44, 98, 108, 88, 75, 60, '*'];

    // Header row
    var tableBody = [
        cols.map(function(c) {
            return { text: c.label, style: "tableHeader" };
        }).concat([{ text: "Checklist", style: "tableHeader" }])
    ];

    // Data rows
    var rowCount = 0;
    for (var i = 1; i < table.rows.length; i++) {
        if (table.rows[i].style.display === "none") continue;
        var cells = table.rows[i].cells;
        var isEven = rowCount % 2 === 0;
        var fill = isEven ? "#ffffff" : "#f4f6f9";
        var row = cols.map(function(c) {
            var text = cells[c.idx] ? (cells[c.idx].innerText || "") : "";
            return { text: text, fillColor: fill, color: "#222222" };
        });

        // Checklist
        var procedureText = cells[15] ? (cells[15].textContent || "").trim() : "";
        var actionText    = cells[13] ? (cells[13].textContent || "").trim() : "";
        var checklistText = formatProcedureForPDF(procedureText, actionText);

        row.push({ text: checklistText, fillColor: fill, color: "#222222", fontSize: 6.5 });

        tableBody.push(row);
        rowCount++;
    }

    var now = new Date();
    var dataHora = now.toLocaleDateString("pt-br") + "  " + now.toLocaleTimeString("pt-br");

    // Page header: logo + title + date
    var pageHeader = {
        columns: [
            fleuryLogoBase64
                ? { image: fleuryLogoBase64, width: 55, margin: [0, 0, 0, 0] }
                : { text: "", width: 55 },
            {
                stack: [
                    { text: "Relatório de Alarmes", style: "titulo" },
                    { text: "Fleury Medicina e Saúde", style: "subtitulo" },
                ],
                alignment: "center",
            },
            {
                stack: [
                    { text: "Emitido em:", style: "labelData" },
                    { text: dataHora, style: "valorData" },
                    { text: rowCount + " registro(s)", style: "valorData" },
                ],
                alignment: "right",
                width: 130,
            },
        ],
        margin: [0, 0, 0, 10],
    };

    var docDefinition = {
        pageOrientation: "landscape",
        pageMargins: [24, 24, 24, 36],
        content: [
            pageHeader,
            { canvas: [{ type: "line", x1: 0, y1: 0, x2: 793, y2: 0, lineWidth: 1.5, lineColor: "#2C6FAC" }], margin: [0, 0, 0, 8] },
            {
                table: {
                    headerRows: 1,
                    widths: colWidths,
                    body: tableBody,
                },
                layout: {
                    hLineWidth: function(i) { return i === 0 || i === 1 ? 0 : 0.5; },
                    vLineWidth: function() { return 0; },
                    hLineColor: function() { return "#d0d7e3"; },
                    paddingLeft:   function() { return 4; },
                    paddingRight:  function() { return 4; },
                    paddingTop:    function() { return 3; },
                    paddingBottom: function() { return 3; },
                },
            },
        ],
        footer: function(page, pages) {
            return {
                columns: [
                    { text: "Fleury Medicina e Saúde — Relatório de Alarmes", style: "rodape", alignment: "left" },
                    { text: "Página " + page + " de " + pages, style: "rodape", alignment: "right" },
                ],
                margin: [24, 10],
            };
        },
        defaultStyle: { fontSize: 7.5, color: "#222222" },
        styles: {
            titulo:     { fontSize: 15, bold: true, color: "#1a3a5c" },
            subtitulo:  { fontSize: 9,  color: "#5a7a9a" },
            labelData:  { fontSize: 7,  color: "#888888" },
            valorData:  { fontSize: 8,  bold: true, color: "#1a3a5c" },
            tableHeader:{ fontSize: 8,  bold: true, color: "#ffffff", fillColor: "#2C6FAC", alignment: "center" },
            rodape:     { fontSize: 7,  color: "#999999" },
        },
    };

    pdfMake.createPdf(docDefinition).download("Fleury_Alarmes_" + formattedDateTime(new Date()) + ".pdf");
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
    var obj_id = document.getElementById("card_camera").innerHTML;
    var auxid = document.querySelector('tr[tabindex="' + id + '"]');
    var currentState = auxid.querySelector("tr td#state").textContent;
    console.log("state ", id, currentState);

    if (value === currentState) return;

    // Validate checklist before concluding
    if (value === "Concluído" && CHECKLISTS[activeAlarmClass]) {
        var area = document.getElementById("checklistArea");
        if (area && area.style.display === "none") {
            var rowEl = document.querySelector('tr[tabindex="' + id + '"]');
            var savedProc = rowEl ? (rowEl.querySelector("td#procedure") || {}).innerHTML || "" : "";
            renderChecklist(activeAlarmClass, savedProc);
        }
        if (!allChecklistAnswered()) {
            showToast("Preencha todos os itens do checklist antes de concluir.", "danger");
            return;
        }
    }

    var checklistData = getChecklistData();
    var json = {
        id: id,
        obj_id: obj_id,
        state: value,
        operator: operator || "Usuário Externo",
        // A mudança de status registra apenas o rótulo do status (linha de evento).
        // Comentários do operador são independentes, via addComment().
        comment: value,
    };
    if (checklistData) json.procedure = checklistData;

    switch (value) {
        case "Em Atendimento Técnico":
            if (["Em Atendimento Técnico", "Concluído", "Falha de Sistema", "Não tratado", "Alarme Falso"].includes(currentState)) {
                json.response_time = localtimeString;
                break;
            }

        case "Concluído":
            if (["Em Atendimento Técnico", "Falha de Sistema", "Não tratado", "Alarme Falso"].includes(currentState)) {
                json.resolution_time = localtimeString;
            }
            break;
        case "Alarme Falso":
            json.resolution_time = localtimeString;
            break;
        default:
    }

    document.getElementById("card_state").innerHTML = value;
    // Atualiza o estado na linha da tabela imediatamente, sem esperar o re-emit do servidor
    if (auxid) {
        var stateTd = auxid.querySelector("td#state");
        if (stateTd) stateTd.textContent = value;
    }
    socket.emit("state", json);

    // Update checklist visibility/state after action.
    // Usa o checklist recém-enviado (checklistData) para refletir na hora, sem esperar
    // o retorno do servidor / reabrir o evento. Fallback para o que já está salvo na linha.
    var row = document.querySelector('tr[tabindex="' + id + '"]');
    var savedProc = checklistData || (row ? (row.querySelector("td#procedure") || {}).innerHTML || "" : "");
    if (value === "Em Atendimento Técnico") {
        renderChecklist(activeAlarmClass, savedProc, false);
    } else if (value === "Concluído" || value === "Alarme Falso") {
        renderChecklist(activeAlarmClass, savedProc, true);
    }
}

// Comentário do operador — independente da mudança de status (pode adicionar quantos quiser)
function addComment() {
    var co = document.getElementById("card_comment").value.trim();
    if (!co) return;

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
    var obj_id = document.getElementById("card_camera").innerHTML;

    document.getElementById("card_comment").value = "";
    socket.emit("comment", {
        id: id,
        obj_id: obj_id,
        operator: operator || "Usuário Externo",
        comment: co,
        date: localtimeString,
    });
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

    if (value == "Em Atendimento Técnico" && currentState == "Não tratado") {
        json.comment += "Evento registrado em massa";
        json.response_time = localtimeString;
        console.log("masiveState state", json, "currentState", currentState);
        socket.emit("state", json);
    } else if (value == "Concluído" && ["Em Atendimento Técnico", "Falha de Sistema", "Não tratado", "Alarme Falso"].includes(currentState)) {
        json.resolution_time = localtimeString;
        json.comment += "Evento concluído em massa";
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
    if (filterstate == "Alarme") filterstate = "Alarme Falso";
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

                if (txtValue == "Não tratado" || txtValue == "Em Atendimento Técnico") {
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
