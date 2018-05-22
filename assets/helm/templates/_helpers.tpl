{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "k8-automation.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "k8-automation.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "k8-automation.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create the name of the service account to use.
*/}}
{{- define "k8-automation.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
    {{ default (include "k8-automation.fullname" .) .Values.serviceAccount.name }}
{{- else -}}
    {{ default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Check to make sure all required values are set.
*/}}
{{- define "k8-automation.requiredValues" -}}
{{- if not .Values.secret.token -}}
{{- required "You must supply a secret.token" .Values.secret.token -}}
{{- end -}}
{{- if and (not .Values.config.teamIds) (not .Values.config.groups) -}}
{{- required "You must supply at least one Atomist team ID or, less likely, group" .Values.config.teamIds -}}
{{- end -}}
{{- if and (not (eq .Values.config.kubernetes.mode "cluster")) (not (eq .Values.config.kubernetes.mode "namespace")) -}}
{{- required (printf "Kubernetes mode (.Values.config.kubernetes.mode=%s) must be either 'cluster' or 'namespace'" .Values.config.kubernetes.mode) nil -}}
{{- end -}}
{{- end -}}
