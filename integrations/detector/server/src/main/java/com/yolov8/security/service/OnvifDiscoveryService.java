package com.yolov8.security.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import java.io.StringReader;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class OnvifDiscoveryService {

    private static final Logger log = LoggerFactory.getLogger(OnvifDiscoveryService.class);

    private static final String MULTICAST_ADDR = "239.255.255.250";
    private static final int MULTICAST_PORT = 3702;
    private static final int TIMEOUT_MS = 3000;

    public List<DiscoveredCamera> discover() {
        List<DiscoveredCamera> results = new ArrayList<>();

        String probe = buildProbeMessage();

        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setSoTimeout(500);

            InetAddress group = InetAddress.getByName(MULTICAST_ADDR);
            byte[] data = probe.getBytes(StandardCharsets.UTF_8);
            DatagramPacket packet = new DatagramPacket(data, data.length, group, MULTICAST_PORT);
            socket.send(packet);

            long deadline = System.currentTimeMillis() + TIMEOUT_MS;
            byte[] buf = new byte[8192];

            while (System.currentTimeMillis() < deadline) {
                try {
                    DatagramPacket recv = new DatagramPacket(buf, buf.length);
                    socket.receive(recv);
                    String response = new String(recv.getData(), 0, recv.getLength(), StandardCharsets.UTF_8);
                    DiscoveredCamera camera = parseResponse(response, recv.getAddress().getHostAddress());
                    if (camera != null) {
                        boolean duplicate = results.stream().anyMatch(c -> c.ip.equals(camera.ip));
                        if (!duplicate) {
                            results.add(camera);
                            log.info("发现摄像头: {} ({})", camera.ip, camera.brand);
                        }
                    }
                } catch (SocketTimeoutException e) {
                    break;
                }
            }
        } catch (Exception e) {
            log.error("ONVIF 扫描失败", e);
        }

        results.sort(Comparator.comparing(c -> c.ip));
        return results;
    }

    private String buildProbeMessage() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            + "<e:Envelope xmlns:e=\"http://www.w3.org/2003/05/soap-envelope\""
            + " xmlns:w=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\""
            + " xmlns:d=\"http://schemas.xmlsoap.org/ws/2005/04/discovery\">"
            + "<e:Header>"
            + "<w:MessageID>uuid:" + UUID.randomUUID() + "</w:MessageID>"
            + "<w:To e:mustUnderstand=\"true\">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>"
            + "<w:Action e:mustUnderstand=\"true\">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>"
            + "</e:Header>"
            + "<e:Body>"
            + "<d:Probe>"
            + "<d:Types>dn:NetworkVideoTransmitter</d:Types>"
            + "</d:Probe>"
            + "</e:Body>"
            + "</e:Envelope>";
    }

    private DiscoveredCamera parseResponse(String xml, String ip) {
        try {
            DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
            dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
            dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            dbf.setNamespaceAware(true);
            DocumentBuilder db = dbf.newDocumentBuilder();
            Document doc = db.parse(new InputSource(new StringReader(xml)));

            DiscoveredCamera camera = new DiscoveredCamera();
            camera.ip = ip;

            // Extract XAddrs (ignore namespace)
            String xaddr = getElementTextByLocalName(doc, "XAddrs");
            if (xaddr != null && !xaddr.isEmpty()) {
                camera.serviceUrl = xaddr.trim().split("\\s+")[0];
            }

            // Extract Scopes
            String scopes = getElementTextByLocalName(doc, "Scopes");
            if (scopes != null) {
                camera.brand = extractScope(scopes, "hardware/");
                camera.model = extractScope(scopes, "model/");
                camera.name = extractScope(scopes, "name/");
            }

            if (camera.name == null || camera.name.isEmpty()) {
                camera.name = "ONVIF Camera (" + ip + ")";
            }

            // RTSP: guess based on brand
            camera.rtspUrl = guessRtspUrl(ip, camera.brand);

            return camera;
        } catch (Exception e) {
            log.debug("解析 ONVIF 响应失败: {}", e.getMessage());
            return null;
        }
    }

    private String getElementTextByLocalName(Document doc, String localName) {
        NodeList nodes = doc.getElementsByTagNameNS("*", localName);
        if (nodes.getLength() > 0) {
            return nodes.item(0).getTextContent();
        }
        return null;
    }

    private String guessRtspUrl(String ip, String brand) {
        if (brand != null) {
            String lower = brand.toLowerCase();
            if (lower.contains("hikvision") || lower.contains("海康")) {
                return "rtsp://" + ip + ":554/Streaming/Channels/101";
            }
            if (lower.contains("dahua") || lower.contains("大华")) {
                return "rtsp://" + ip + ":554/cam/realmonitor?channel=1&subtype=0";
            }
            if (lower.contains("axis")) {
                return "rtsp://" + ip + ":554/axis-media/media.amp";
            }
        }
        return "rtsp://" + ip + ":554/";
    }

    private String extractScope(String scopes, String prefix) {
        for (String scope : scopes.split("\\s+")) {
            if (scope.contains(prefix)) {
                int idx = scope.indexOf(prefix);
                String value = scope.substring(idx + prefix.length());
                if (value.endsWith("/")) value = value.substring(0, value.length() - 1);
                return value;
            }
        }
        return null;
    }

    public static class DiscoveredCamera {
        public String ip;
        public String name;
        public String brand;
        public String model;
        public String rtspUrl;
        public String serviceUrl;

        @Override
        public String toString() {
            return "DiscoveredCamera{ip='" + ip + "', brand='" + brand + "', model='" + model + "'}";
        }
    }
}
