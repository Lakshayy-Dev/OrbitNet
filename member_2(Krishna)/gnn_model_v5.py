import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv


class OrbitNetGNNv5(nn.Module):

    def __init__(
        self,
        in_channels,
        hidden_channels=32,
        embedding_channels=16
    ):

        super(OrbitNetGNNv5, self).__init__()

        # ====================================================
        # GRAPH CONVOLUTION LAYERS
        # ====================================================

        self.conv1 = SAGEConv(
            in_channels,
            hidden_channels
        )

        self.conv2 = SAGEConv(
            hidden_channels,
            embedding_channels
        )


        # ====================================================
        # EDGE COST NETWORK
        #
        # Input:
        #
        # source embedding       = 16
        # target embedding       = 16
        # source energy          = 1
        # target energy          = 1
        # source eclipse         = 1
        # target eclipse         = 1
        # edge distance          = 1
        #
        # Total = 37
        # ====================================================

        edge_input_size = (
            embedding_channels * 2
            + 5
        )


        self.edge_mlp = nn.Sequential(

            nn.Linear(
                edge_input_size,
                64
            ),

            nn.ReLU(),

            nn.Linear(
                64,
                32
            ),

            nn.ReLU(),

            nn.Linear(
                32,
                1
            ),

            nn.Softplus()
        )


    # ========================================================
    # GET NODE EMBEDDINGS
    # ========================================================

    def get_embeddings(
        self,
        x,
        edge_index
    ):

        x = self.conv1(
            x,
            edge_index
        )

        x = F.relu(x)

        x = F.dropout(
            x,
            p=0.2,
            training=self.training
        )

        x = self.conv2(
            x,
            edge_index
        )

        return x


    # ========================================================
    # PREDICT EDGE COST
    # ========================================================

    def edge_cost(
        self,
        embeddings,
        source_indices,
        target_indices,
        edge_distances,
        node_features
    ):

        # ----------------------------------------------------
        # Get source and target embeddings
        # ----------------------------------------------------

        source_embeddings = embeddings[
            source_indices
        ]

        target_embeddings = embeddings[
            target_indices
        ]


        # ----------------------------------------------------
        # Get source and target energy
        #
        # Node feature index 5 = energy / 100
        # ----------------------------------------------------

        source_energy = node_features[
            source_indices,
            5
        ].unsqueeze(1)

        target_energy = node_features[
            target_indices,
            5
        ].unsqueeze(1)


        # ----------------------------------------------------
        # Get source and target eclipse
        #
        # Node feature index 4 = eclipse
        # ----------------------------------------------------

        source_eclipse = node_features[
            source_indices,
            4
        ].unsqueeze(1)

        target_eclipse = node_features[
            target_indices,
            4
        ].unsqueeze(1)


        # ----------------------------------------------------
        # Combine all edge information
        # ----------------------------------------------------

        edge_input = torch.cat(
            [
                source_embeddings,
                target_embeddings,
                source_energy,
                target_energy,
                source_eclipse,
                target_eclipse,
                edge_distances
            ],
            dim=1
        )


        # ----------------------------------------------------
        # Predict positive edge cost
        # ----------------------------------------------------

        cost = self.edge_mlp(
            edge_input
        )


        return cost.squeeze(-1)


    # ========================================================
    # FORWARD
    # ========================================================

    def forward(
        self,
        x,
        edge_index
    ):

        return self.get_embeddings(
            x,
            edge_index
        )