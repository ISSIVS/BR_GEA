CREATE DATABASE dispatch
  WITH OWNER = postgres
       ENCODING = 'UTF8'
       TABLESPACE = pg_default
       CONNECTION LIMIT = -1;

-- Table: events

-- DROP TABLE events;

CREATE TABLE events
(
  id              bigserial NOT NULL,
  object_id       text,
  name            text,
  type            text,
  action          text,
  incident        text,
  state           text,
  priority        text,
  operator        text,
  params          text,
  "time"          timestamp without time zone,
  response_time   timestamp without time zone,
  resolution_time timestamp without time zone,
  procedure       text,
  CONSTRAINT events_pkey PRIMARY KEY (id)
);
ALTER TABLE events OWNER TO postgres;

-- Table: logs

-- DROP TABLE logs;

CREATE TABLE logs
(
  id bigserial NOT NULL,
  incident_id bigint,
  "time" timestamp without time zone,
  operator text,
  event text,
  CONSTRAINT logs_pkey PRIMARY KEY (id )
)
WITH (
  OIDS=FALSE
);
ALTER TABLE logs
  OWNER TO postgres;

-- Table: public.comments

-- DROP TABLE public.comments;

CREATE TABLE public.comments
(
    id      bigserial NOT NULL,
    panel   text COLLATE pg_catalog."default",
    comment text COLLATE pg_catalog."default",
    date    timestamp without time zone,
    "user"  text COLLATE pg_catalog."default",
    eventid bigint,
    CONSTRAINT comments_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

ALTER TABLE public.comments
    OWNER to postgres;

-- Índices

-- events: filtro por intervalo de tempo (select_filter) e ordenação (select)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_time
    ON events (time DESC);

-- events: busca por object_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_object_id
    ON events (object_id);

-- comments: busca por eventid (socket "abonado")
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_eventid
    ON comments (eventid);

-- comments: ordenação por data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_date
    ON comments (date ASC);

-- logs: limpeza por tempo (limit_database)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_time
    ON logs (time DESC);