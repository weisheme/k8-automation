FROM node:9

MAINTAINER David Dooling <david@atomist.com>

ENV DUMB_INIT_VERSION=1.2.1

RUN curl -s -L -O https://github.com/Yelp/dumb-init/releases/download/v$DUMB_INIT_VERSION/dumb-init_${DUMB_INIT_VERSION}_amd64.deb \
    && dpkg -i dumb-init_${DUMB_INIT_VERSION}_amd64.deb \
    && rm -f dumb-init_${DUMB_INIT_VERSION}_amd64.deb

# RUN curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add -

# ENV CLOUD_SDK_REPO=cloud-sdk-jessie

# RUN echo "deb http://packages.cloud.google.com/apt $CLOUD_SDK_REPO main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

# RUN apt-get update && apt-get install -y \
#         google-cloud-sdk \
#     && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/app

WORKDIR /opt/app

COPY . .

ENV NPM_CONFIG_LOGLEVEL warn

RUN npm install

ENV SUPPRESS_NO_CONFIG_WARNING true

EXPOSE 2866

ENTRYPOINT ["dumb-init", "node", "--trace-warnings", "--expose_gc", "--optimize_for_size", "--always_compact", "--max_old_space_size=256"]

CMD ["node_modules/@atomist/automation-client/start.client.js"]
