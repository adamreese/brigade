FROM alpine:3.6

RUN apk add --no-cache ca-certificates && update-ca-certificates

COPY rootfs/brigade-api-rpc /usr/bin/brigade-api-rpc

CMD /usr/bin/brigade-api-rpc
