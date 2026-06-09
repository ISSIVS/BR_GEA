
socket.on('comments', function (comments) {
    update_comments(comments);
});

var STATUS_PREFIXES = ["Em Atendimento Técnico", "Concluído", "Alarme Falso"];

function isStatusChange(text) {
    if (!text) return false;
    return STATUS_PREFIXES.some(function(p) { return text === p || text.indexOf(p + ": ") === 0; });
}

function update_comments(comments) {
    var rows = document.getElementById('inbox_chat');

    // Só renderiza comentários do evento que está aberto neste cliente.
    // O backend faz broadcast (io.emit) dos comentários; sem este filtro, o comentário
    // de um evento apareceria no card de outro evento aberto em outro cliente.
    var openId = (document.getElementById('card_title').innerHTML || '').trim();
    if (comments && comments.length > 0 && String(comments[0].eventid) !== openId) return;

    var html = '';

    var userOrder = [];
    for (var i = 0; i < comments.length; i++) {
        var u = comments[i].user;
        if (userOrder.indexOf(u) === -1) userOrder.push(u);
    }

    for (var j = 0; j < comments.length; j++) {
        var c = comments[j];
        var date = new Date(c.date).toLocaleDateString("es-CO", options2);

        if (isStatusChange(c.comment)) {
            // Status change — compact event line
            var parts = c.comment.split(": ");
            var statusLabel = parts[0];
            var statusNote  = parts.slice(1).join(": ");

            html += '<div class="status-event">';
            html +=   '<span class="status-event-label">' + statusLabel + '</span>';
            if (statusNote) html += '<span class="status-event-note"> — ' + statusNote + '</span>';
            html +=   '<span class="status-event-meta">' + c.user + ' · ' + date + '</span>';
            html += '</div>';
        } else {
            // Regular comment — chat bubble
            var userIndex = userOrder.indexOf(c.user);
            var cssClass = userIndex % 2 === 0 ? 'chat_list active_chat' : 'chat_list active_chat even';

            html += '<div class="' + cssClass + '">';
            html +=   '<div class="chat_people">';
            html +=     '<div class="chat_ib">';
            html +=       '<h5>' + c.user + '<span class="chat_date">' + date + '</span></h5>';
            html +=       '<p>' + c.comment + '</p>';
            html +=     '</div>';
            html +=   '</div>';
            html += '</div>';
        }
    }

    rows.innerHTML = html;
    rows.scrollTop = rows.scrollHeight;
}
