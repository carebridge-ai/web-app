# Documentation

AI Health Insurance Navigator (Canada)

A full-stack web application designed to help first-time buyers of health insurance in Canada, especially immigrants and newcomers, understand their options and select the best insurance plan for their needs.

The platform analyzes a user's demographic information and medical history, compares it against a database of insurance plans, and recommends the top three plans that best match their situation. It also generates clear explanations and a long-term cost visualization to help users make informed decisions.

The Problem

Navigating the Canadian health insurance system can be confusing, especially for newcomers who may not be familiar with:

provincial coverage differences

private insurance options

eligibility rules

coverage categories

long-term healthcare costs

Most existing tools simply list plans without providing personalized recommendations or explanations.

Our goal is to make insurance selection simple, transparent, and data-driven.

The Solution

This application combines LLM-powered data processing with a recommendation system to guide users toward the best insurance options.

The platform:

Collects demographic and medical information from users

Processes and structures this data using an LLM API

Extracts insurance plan details from markdown documents

Matches users with the most suitable insurance plans

Generates clear summaries and a 10-year cost comparison visualization

The result is an AI assistant for insurance decisions that is easy to use even for people unfamiliar with the Canadian system.

System Architecture

The application follows a multi-stage pipeline.

1. User Data Collection

Users submit information through the web interface.

Collected information includes:

name

age

nationality

written medical history

uploaded medical records or reports

All raw user input is stored in a database referred to as:

DB1

This database stores:

demographic data

raw medical text

uploaded documents

timestamps

user session identifiers

Raw data is never modified.

2. LLM-Based User Data Processing

An LLM API agent processes the raw information stored in DB1.

The model extracts structured medical information such as:

chronic conditions

medications

risk factors

allergies

smoking status

overall risk level

The output becomes a structured JSON patient profile.

Example:

{
  "patient_profile": {
    "age": 45,
    "conditions": ["type_2_diabetes"],
    "risk_level": "moderate",
    "smoker": false
  }
}

This structured profile is stored in a processed user database.

3. Insurance Plan Data Extraction

The system also maintains a repository of insurance plans stored as Markdown (.md) files.

Each file contains information such as:

plan name

provider

monthly premium

deductible

coverage types

eligibility requirements

geographic restrictions

An LLM pipeline scans these markdown files and extracts structured plan information.

Example extracted data:

{
  "plan_name": "Silver Plus",
  "provider": "Healthcare Inc",
  "monthly_premium": 215,
  "deductible": 1500,
  "covers_prescriptions": true,
  "covers_specialists": true
}

All extracted plans are stored in a structured insurance plan database.

4. Insurance Plan Recommendation

The system evaluates compatibility between the user's profile and available insurance plans.

This stage considers:

eligibility requirements

medical condition coverage

pricing

risk protection

coverage completeness

The system outputs the top three recommended insurance plans.

Example output:

{
  "recommended_plans": [
    { "plan_name": "Silver Plus", "score": 0.91 },
    { "plan_name": "Gold Care", "score": 0.88 },
    { "plan_name": "Premium Secure", "score": 0.85 }
  ]
}
5. LLM-Generated Plan Explanations

Once the recommendations are generated, an LLM API agent:

retrieves the full plan details

generates simple explanations

explains why each plan fits the user's situation

These explanations are displayed directly in the web interface.

6. Long-Term Cost Visualization

To help users understand the financial impact of insurance decisions, the system generates a 10-year cost comparison visualization.

Two scenarios are shown:

Scenario A
User purchases the #1 recommended insurance plan.

Scenario B
User does not purchase insurance and pays healthcare costs out-of-pocket.

Example visualization data:

{
  "ten_year_projection": [
    { "year": 1, "with_insurance": 2600, "without_insurance": 4200 },
    { "year": 2, "with_insurance": 5200, "without_insurance": 9000 }
  ]
}

This helps users clearly see the long-term financial protection provided by insurance.

Scalability

The system is designed to scale in several ways:

Modular architecture

Each stage of the pipeline operates independently.

Automated plan ingestion

New insurance plans can be added simply by placing new markdown files in the repository.

LLM abstraction layer

The system supports multiple LLM providers through a single interface, allowing easy switching between APIs.

Asynchronous processing

LLM processing tasks can run in background workers to support large numbers of users.

Tech Stack

Possible technologies used in the system:

Frontend

React

Next.js

Backend

Node.js or Python

REST API

AI Processing

LLM APIs (Anthropic, OpenAI, etc.)

Data Storage

PostgreSQL

structured JSON storage

Visualization

Chart.js

D3.js

Infrastructure

Docker

cloud deployment

Target Users

This platform is designed for:

immigrants and newcomers to Canada

international students

temporary workers

first-time private insurance buyers

Our goal is to make the Canadian insurance landscape accessible and understandable for everyone.

Future Improvements

Possible future upgrades include:

multilingual support

province-specific insurance recommendations

real-time insurance pricing updates

expanded coverage databases

risk simulation models for healthcare expenses

Hackathon Summary

This project demonstrates how AI can simplify complex financial decisions by combining:

LLM-based document processing

automated insurance plan ingestion

intelligent recommendation systems

explainable outputs

data visualizations

The result is an AI assistant that helps newcomers confidently choose the right health insurance plan in Canada.

If you'd like, I can also generate a much stronger hackathon-style README (the kind that wins prizes) with:

architecture diagrams

pipeline diagrams

screenshots sections

demo instructions.
