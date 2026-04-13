
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: dispatch; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE dispatch WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'Portuguese_Brazil.1252' LC_CTYPE = 'Portuguese_Brazil.1252';


ALTER DATABASE dispatch OWNER TO postgres;

\connect dispatch

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb
);


ALTER TABLE public.app_settings OWNER TO postgres;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comments (
    panel text,
    comment text,
    date timestamp without time zone,
    "user" text,
    eventid text
);


ALTER TABLE public.comments OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    incident text,
    object_id text,
    params text,
    "time" timestamp without time zone,
    type text,
    operator text,
    state text,
    comment text,
    response_time timestamp without time zone,
    resolution_time timestamp without time zone,
    priority text,
    action text,
    id bigint NOT NULL,
    name text,
    cam_id text
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: COLUMN events.incident; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.incident IS 'Intrusion detector, Armed, Alarmed, etc';


--
-- Name: COLUMN events.type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.type IS 'Usually CAM

';


--
-- Name: COLUMN events.state; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.state IS 'New, In Progress, Resolved, Closed';


--
-- Name: COLUMN events.comment; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.comment IS 'Operator comment abour incident';


--
-- Name: COLUMN events.priority; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.priority IS 'High, Medium, Low';


--
-- Name: COLUMN events.action; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.action IS 'Transfer,False Alarm,Export Incident';


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.events_id_seq OWNER TO postgres;

--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;


--
-- Name: logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.logs (
    id bigint NOT NULL,
    incident_id bigint,
    "time" timestamp without time zone,
    operator text,
    event text
);


ALTER TABLE public.logs OWNER TO postgres;

--
-- Name: logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.logs_id_seq OWNER TO postgres;

--
-- Name: logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.logs_id_seq OWNED BY public.logs.id;


--
-- Name: events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events ALTER COLUMN id SET DEFAULT nextval('public.events_id_seq'::regclass);


--
-- Name: logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs ALTER COLUMN id SET DEFAULT nextval('public.logs_id_seq'::regclass);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--

