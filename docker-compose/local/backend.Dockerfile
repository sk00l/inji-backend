# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
ENV MAVEN_OPTS=-Xmx480m
COPY . .
RUN --mount=type=cache,target=/root/.m2 \
    mvn -s docker-compose/local/maven-settings.xml -B package \
    -Dgpg.skip=true -Dmaven.javadoc.skip=true -Dmaven.gitcommitid.skip=true \
    -Dtest=CredentialMatchingServiceTest,CredentialsSupportedMetadataTest,OpenId4VciFinalWireTest,CredentialRequestServiceTest,CredentialServiceTest,IssuerConfigUtilTest,IssuersServiceTest,CustomOAuth2UserServiceTest,ConfigTest,UserMetadataServiceTest,OpenID4VPServiceTest,WalletPresentationServiceTest \
    -DargLine=-Xmx180m && \
    cp target/mimoto-0.22.0.jar /tmp/mimoto.jar

FROM eclipse-temurin:21-jre
WORKDIR /home/mosip
RUN mkdir -p data certs
COPY --from=build /tmp/mimoto.jar ./mimoto.jar
EXPOSE 8099
ENTRYPOINT ["java", "-jar", "mimoto.jar"]
