--
-- PostgreSQL database dump
--
-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

-- Started on 2026-09-26 21:47:08 PST

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
-- TOC entry 222 (class 1259 OID 16422)
-- Name: admin; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin (
    admin_id integer,
    name character varying(100) NOT NULL,
    role character varying(50) NOT NULL,
    email character varying(254) NOT NULL,
    created_at timestamp without time zone
);


ALTER TABLE public.admin OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 16430)
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_log (
    log_id integer NOT NULL,
    admin_id integer NOT NULL,
    member_id integer,
    action character varying(255) NOT NULL,
    module character varying(255) NOT NULL,
    "timestamp" timestamp without time zone NOT NULL
);


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16455)
-- Name: co_maker; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.co_maker (
    co_maker_id integer NOT NULL,
    loan_id integer NOT NULL,
    member_id integer NOT NULL,
    signed_at date
);


ALTER TABLE public.co_maker OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 16454)
-- Name: co_maker_co_maker_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.co_maker ALTER COLUMN co_maker_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.co_maker_co_maker_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 218 (class 1259 OID 16402)
-- Name: dividend; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dividend (
    dividend_id integer NOT NULL,
    member_id integer NOT NULL,
    amount numeric NOT NULL,
    period character varying(20) NOT NULL,
    date_computed date NOT NULL,
    computed_by integer
);


ALTER TABLE public.dividend OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16407)
-- Name: ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ledger (
    ledger_id integer NOT NULL,
    date date NOT NULL,
    type character varying(20) NOT NULL,
    description text,
    amount numeric NOT NULL,
    admin_id integer NOT NULL
);


ALTER TABLE public.ledger OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 16412)
-- Name: loan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loan (
    loan_id integer NOT NULL,
    member_id integer NOT NULL,
    application_id integer,
    approved_by integer,
    amount numeric NOT NULL,
    interest_rate numeric NOT NULL,
    date_issued date NOT NULL,
    due_date date NOT NULL,
    status character varying(20) NOT NULL,
    created_at timestamp without time zone,
    term_months integer,
    loan_type character varying(30)
);


ALTER TABLE public.loan OWNER TO postgres;

--
-- TOC entry 216 (class 1259 OID 16391)
-- Name: loan_application; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loan_application (
    application_id integer NOT NULL,
    member_id integer NOT NULL,
    amount numeric NOT NULL,
    purpose text NOT NULL,
    status character varying(20) NOT NULL,
    date_submitted date NOT NULL,
    reviewed_by integer,
    date_reviewed date,
    term_months integer,
    loan_type character varying(30)
);


ALTER TABLE public.loan_application OWNER TO postgres;

--
-- TOC entry 215 (class 1259 OID 16390)
-- Name: loan_application_application_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.loan_application_application_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.loan_application_application_id_seq OWNER TO postgres;

--
-- TOC entry 3513 (class 0 OID 0)
-- Dependencies: 215
-- Name: loan_application_application_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.loan_application_application_id_seq OWNED BY public.loan_application.application_id;


--
-- TOC entry 221 (class 1259 OID 16417)
-- Name: member; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member (
    member_id integer NOT NULL,
    name character varying(100) NOT NULL,
    gender character varying(20),
    date_of_birth date,
    address character varying(255),
    contact_number character varying(20),
    email character varying(254),
    tin_number character varying(15),
    government_id character varying(30),
    date_joined date NOT NULL,
    created_at timestamp without time zone,
    member_type character varying(20) DEFAULT 'regular'::character varying,
    status character varying(20) DEFAULT 'active'::character varying
);


ALTER TABLE public.member OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16425)
-- Name: payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment (
    payment_id integer NOT NULL,
    loan_id integer NOT NULL,
    member_id integer,
    amount numeric NOT NULL,
    date date NOT NULL,
    reference_number character varying(50),
    status character varying(50) NOT NULL,
    receipt_image_url character varying(255),
    receipt_expiry_date date,
    verified_by integer,
    date_verified date,
    installment_no integer,
    expected_amount numeric(12,2),
    due_date date
);


ALTER TABLE public.payment OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16435)
-- Name: report; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report (
    report_id integer NOT NULL,
    type character varying(255) NOT NULL,
    date_generated date NOT NULL,
    date_from date,
    date_to date,
    file_url character varying(255),
    admin_id integer
);


ALTER TABLE public.report OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 16397)
-- Name: share_capital; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.share_capital (
    share_id integer NOT NULL,
    member_id integer NOT NULL,
    amount numeric NOT NULL,
    date_recorded date NOT NULL,
    recorded_by integer
);


ALTER TABLE public.share_capital OWNER TO postgres;

--
-- TOC entry 3324 (class 2604 OID 16394)
-- Name: loan_application application_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_application ALTER COLUMN application_id SET DEFAULT nextval('public.loan_application_application_id_seq'::regclass);


--
-- TOC entry 3342 (class 2606 OID 16475)
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (log_id);


--
-- TOC entry 3346 (class 2606 OID 16459)
-- Name: co_maker co_maker_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.co_maker
    ADD CONSTRAINT co_maker_pkey PRIMARY KEY (co_maker_id);


--
-- TOC entry 3332 (class 2606 OID 16477)
-- Name: dividend dividend_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dividend
    ADD CONSTRAINT dividend_pkey PRIMARY KEY (dividend_id);


--
-- TOC entry 3334 (class 2606 OID 16479)
-- Name: ledger ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledger
    ADD CONSTRAINT ledger_pkey PRIMARY KEY (ledger_id);


--
-- TOC entry 3328 (class 2606 OID 16471)
-- Name: loan_application loan_application_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_application
    ADD CONSTRAINT loan_application_pkey PRIMARY KEY (application_id);


--
-- TOC entry 3336 (class 2606 OID 16449)
-- Name: loan loan_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan
    ADD CONSTRAINT loan_pkey PRIMARY KEY (loan_id);


--
-- TOC entry 3338 (class 2606 OID 16451)
-- Name: member member_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (member_id);


--
-- TOC entry 3340 (class 2606 OID 16473)
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (payment_id);


--
-- TOC entry 3344 (class 2606 OID 16481)
-- Name: report report_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT report_pkey PRIMARY KEY (report_id);


--
-- TOC entry 3330 (class 2606 OID 16483)
-- Name: share_capital share_capital_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.share_capital
    ADD CONSTRAINT share_capital_pkey PRIMARY KEY (share_id);


--
-- TOC entry 3350 (class 2606 OID 16460)
-- Name: co_maker co_maker_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.co_maker
    ADD CONSTRAINT co_maker_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loan(loan_id);


--
-- TOC entry 3351 (class 2606 OID 16465)
-- Name: co_maker co_maker_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.co_maker
    ADD CONSTRAINT co_maker_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- TOC entry 3347 (class 2606 OID 16494)
-- Name: loan_application loan_app_member_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_application
    ADD CONSTRAINT loan_app_member_fkey FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- TOC entry 3348 (class 2606 OID 16489)
-- Name: loan loan_member_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan
    ADD CONSTRAINT loan_member_fkey FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- TOC entry 3349 (class 2606 OID 16484)
-- Name: payment payment_loan_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_loan_fkey FOREIGN KEY (loan_id) REFERENCES public.loan(loan_id);


-- Completed on 2026-09-26 21:47:08 PST

--
-- PostgreSQL database dump complete
--
